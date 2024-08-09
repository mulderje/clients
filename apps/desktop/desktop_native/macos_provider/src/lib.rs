use std::sync::{atomic::AtomicU64, Arc, Mutex};

use log::{error, warn};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

uniffi::setup_scaffolding!();

#[derive(uniffi::Enum, Debug, Serialize, Deserialize)]
pub enum UserVerification {
    Preferred,
    Required,
    Discouraged,
}

#[derive(uniffi::Record, Debug, Serialize, Deserialize)]
pub struct PasskeyRegistrationRequest {
    relying_party_id: String,
    user_name: String,
    user_handle: Vec<u8>,

    client_data_hash: Vec<u8>,
    user_verification: UserVerification,
}

#[derive(uniffi::Record, Serialize, Deserialize)]
pub struct PasskeyRegistrationCredential {
    relying_party: String,
    client_data_hash: Vec<u8>,
    credential_id: Vec<u8>,
    attestation_object: Vec<u8>,
}

#[derive(uniffi::Error, Serialize, Deserialize)]
pub enum BitwardenError {
    Internal(String),
}

#[uniffi::export(with_foreign)]
pub trait PreparePasskeyRegistrationCallback: Send + Sync {
    fn on_complete(&self, credential: PasskeyRegistrationCredential);
    fn on_error(&self, error: BitwardenError);
}

#[derive(uniffi::Object)]
pub struct MacOSProviderClient {
    to_server_send: tokio::sync::mpsc::Sender<String>,

    // We need to keep track of the callbacks so we can call them when we receive a response
    response_callbacks_counter: AtomicU64,
    response_callbacks_queue: Arc<Mutex<Vec<(u64, Arc<dyn PreparePasskeyRegistrationCallback>)>>>,
}

#[uniffi::export]
impl MacOSProviderClient {
    #[allow(clippy::new_without_default)]
    #[uniffi::constructor]
    pub fn new() -> Self {
        let _ = oslog::OsLogger::new("com.bitwarden.desktop.autofill-extension")
            .level_filter(log::LevelFilter::Trace)
            .init();

        let (from_server_send, mut from_server_recv) = tokio::sync::mpsc::channel(32);
        let (to_server_send, to_server_recv) = tokio::sync::mpsc::channel(32);

        let client = MacOSProviderClient {
            to_server_send,
            response_callbacks_counter: AtomicU64::new(0),
            response_callbacks_queue: Arc::new(Mutex::new(Vec::new())),
        };

        let path = desktop_core::ipc::path("bitwarden_autofill");

        let queue = client.response_callbacks_queue.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Can't create runtime");

            rt.spawn(desktop_core::ipc::client::connect(
                path,
                from_server_send,
                to_server_recv,
            ));

            rt.block_on(async move {
                while let Some(message) = from_server_recv.recv().await {
                    match serde_json::from_str::<SerializedMessage<PasskeyRegistrationCredential>>(
                        &message,
                    ) {
                        Ok(message) => match get_callback(&queue, message.sequence_number) {
                            Some(cb) => match message.value {
                                Ok(value) => cb.on_complete(value),
                                Err(e) => cb.on_error(e),
                            },
                            None => {
                                error!(
                                    "No callback found for sequence number: {}",
                                    message.sequence_number
                                );
                            }
                        },
                        Err(e) => {
                            error!("Error deserializing message: {}", e);
                        }
                    };
                }
            });
        });

        client
    }

    pub fn prepare_passkey_registration(
        &self,
        request: PasskeyRegistrationRequest,
        callback: Arc<dyn PreparePasskeyRegistrationCallback>,
    ) {
        warn!("prepare_passkey_registration: {:?}", request);

        self.send_message(request, callback);
    }
}

#[derive(Serialize, Deserialize)]
#[serde(bound = "T: Serialize + DeserializeOwned")]
struct SerializedMessage<T: Serialize + DeserializeOwned> {
    sequence_number: u64,
    value: Result<T, BitwardenError>,
}

impl MacOSProviderClient {
    fn add_callback(&self, callback: Arc<dyn PreparePasskeyRegistrationCallback>) -> u64 {
        let sequence_number = self
            .response_callbacks_counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        self.response_callbacks_queue
            .lock()
            .unwrap()
            .push((sequence_number, callback));

        sequence_number
    }

    fn send_message(
        &self,
        message: impl Serialize + DeserializeOwned,
        callback: Arc<dyn PreparePasskeyRegistrationCallback>,
    ) {
        let sequence_number = self.add_callback(Arc::clone(&callback));

        let message = serde_json::to_string(&SerializedMessage {
            sequence_number,
            value: Ok(message),
        })
        .expect("Can't serialize message");

        if let Err(e) = self.to_server_send.blocking_send(message) {
            // Make sure we remove the callback from the queue if we can't send the message
            let _ = get_callback(&self.response_callbacks_queue, sequence_number);

            callback.on_error(BitwardenError::Internal(format!(
                "Error sending message: {}",
                e
            )));
        }
    }
}

fn get_callback(
    response_callbacks_queue: &Mutex<Vec<(u64, Arc<dyn PreparePasskeyRegistrationCallback>)>>,
    sequence_number: u64,
) -> Option<Arc<dyn PreparePasskeyRegistrationCallback>> {
    let mut queue = response_callbacks_queue.lock().unwrap();
    let index = queue.iter().position(|(n, _)| *n == sequence_number)?;
    Some(queue.remove(index).1)
}
