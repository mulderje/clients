#[macro_use]
extern crate napi_derive;

#[napi]
pub mod passwords {
    /// Fetch the stored password from the keychain.
    #[napi]
    pub async fn get_password(service: String, account: String) -> napi::Result<String> {
        desktop_core::password::get_password(&service, &account)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Fetch the stored password from the keychain that was stored with Keytar.
    #[napi]
    pub async fn get_password_keytar(service: String, account: String) -> napi::Result<String> {
        desktop_core::password::get_password_keytar(&service, &account)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Save the password to the keychain. Adds an entry if none exists otherwise updates the existing entry.
    #[napi]
    pub async fn set_password(
        service: String,
        account: String,
        password: String,
    ) -> napi::Result<()> {
        desktop_core::password::set_password(&service, &account, &password)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Delete the stored password from the keychain.
    #[napi]
    pub async fn delete_password(service: String, account: String) -> napi::Result<()> {
        desktop_core::password::delete_password(&service, &account)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

#[napi]
pub mod biometrics {
    use desktop_core::biometric::{Biometric, BiometricTrait};

    // Prompt for biometric confirmation
    #[napi]
    pub async fn prompt(
        hwnd: napi::bindgen_prelude::Buffer,
        message: String,
    ) -> napi::Result<bool> {
        Biometric::prompt(hwnd.into(), message).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn available() -> napi::Result<bool> {
        Biometric::available().map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn set_biometric_secret(
        service: String,
        account: String,
        secret: String,
        key_material: Option<KeyMaterial>,
        iv_b64: String,
    ) -> napi::Result<String> {
        Biometric::set_biometric_secret(
            &service,
            &account,
            &secret,
            key_material.map(|m| m.into()),
            &iv_b64,
        )
        .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn get_biometric_secret(
        service: String,
        account: String,
        key_material: Option<KeyMaterial>,
    ) -> napi::Result<String> {
        let result =
            Biometric::get_biometric_secret(&service, &account, key_material.map(|m| m.into()))
                .map_err(|e| napi::Error::from_reason(e.to_string()));
        result
    }

    /// Derives key material from biometric data. Returns a string encoded with a
    /// base64 encoded key and the base64 encoded challenge used to create it
    /// separated by a `|` character.
    ///
    /// If the iv is provided, it will be used as the challenge. Otherwise a random challenge will be generated.
    ///
    /// `format!("<key_base64>|<iv_base64>")`
    #[napi]
    pub async fn derive_key_material(iv: Option<String>) -> napi::Result<OsDerivedKey> {
        Biometric::derive_key_material(iv.as_deref())
            .map(|k| k.into())
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi(object)]
    pub struct KeyMaterial {
        pub os_key_part_b64: String,
        pub client_key_part_b64: Option<String>,
    }

    impl From<KeyMaterial> for desktop_core::biometric::KeyMaterial {
        fn from(km: KeyMaterial) -> Self {
            desktop_core::biometric::KeyMaterial {
                os_key_part_b64: km.os_key_part_b64,
                client_key_part_b64: km.client_key_part_b64,
            }
        }
    }

    #[napi(object)]
    pub struct OsDerivedKey {
        pub key_b64: String,
        pub iv_b64: String,
    }

    impl From<desktop_core::biometric::OsDerivedKey> for OsDerivedKey {
        fn from(km: desktop_core::biometric::OsDerivedKey) -> Self {
            OsDerivedKey {
                key_b64: km.key_b64,
                iv_b64: km.iv_b64,
            }
        }
    }
}

#[napi]
pub mod clipboards {
    #[napi]
    pub async fn read() -> napi::Result<String> {
        desktop_core::clipboard::read().map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn write(text: String, password: bool) -> napi::Result<()> {
        desktop_core::clipboard::write(&text, password)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

#[napi]
pub mod macos_autofill {
    use desktop_core::ipc::server::{Message, MessageType};
    use napi::threadsafe_function::{
        ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode,
    };
    use tokio_util::sync::PollSender;

    #[napi]
    pub struct IpcMessage {
        pub client_id: u32,
        pub kind: IpcMessageType,
        pub message: String,
    }

    impl From<Message> for IpcMessage {
        fn from(message: Message) -> Self {
            IpcMessage {
                client_id: message.client_id,
                kind: message.kind.into(),
                message: message.message,
            }
        }
    }

    #[napi]
    pub enum IpcMessageType {
        Connected,
        Disconnected,
        Message,
    }

    impl From<MessageType> for IpcMessageType {
        fn from(message_type: MessageType) -> Self {
            match message_type {
                MessageType::Connected => IpcMessageType::Connected,
                MessageType::Disconnected => IpcMessageType::Disconnected,
                MessageType::Message => IpcMessageType::Message,
            }
        }
    }

    #[napi]
    pub struct IpcServer {
        server: desktop_core::ipc::server::Server,
    }

    #[napi]
    impl IpcServer {
        /// Create and start the IPC server without blocking.
        /// @param name The endpoint name to listen on. This name uniquely identifies the IPC connection and must be the same for both the server and client.
        /// @param callback This function will be called whenever a message is received from a client.
        #[napi(factory)]
        pub async fn listen(
            name: String,
            #[napi(ts_arg_type = "(error: null | Error, message: IpcMessage) => void")]
            callback: ThreadsafeFunction<IpcMessage, ErrorStrategy::CalleeHandled>,
        ) -> napi::Result<Self> {
            let (send, mut recv) = tokio::sync::mpsc::channel::<Message>(32);
            tokio::spawn(async move {
                while let Some(message) = recv.recv().await {
                    callback.call(Ok(message.into()), ThreadsafeFunctionCallMode::NonBlocking);
                }
            });

            let server = desktop_core::ipc::server::Server::start(&name, PollSender::new(send))
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;

            Ok(IpcServer { server })
        }

        /// Stop the IPC server.
        #[napi]
        pub fn stop(&self) -> napi::Result<()> {
            self.server.stop();
            Ok(())
        }

        /// Send a message over the IPC server to all the connected clients
        /// @return The number of clients that the message was sent to. Note that the number of messages
        /// actually received may be less, as some clients could disconnect before receiving the message.
        #[napi]
        pub fn send(&self, message: String) -> napi::Result<u32> {
            self.server
                .send(message)
                .map_err(|e| napi::Error::from_reason(e.to_string()))
                // NAPI doesn't support u64 or usize, so we need to convert to u32
                .and_then(|u| u32::try_from(u).map_err(|e| napi::Error::from_reason(e.to_string())))
        }
    }
}