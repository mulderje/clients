use std::sync::Arc;

uniffi::setup_scaffolding!();

#[derive(uniffi::Object)]
pub struct MacOSProviderClient {}

#[derive(uniffi::Enum, Debug)]
pub enum UserVerification {
    Preferred,
    Required,
    Discouraged,
}

#[derive(uniffi::Record, Debug)]
pub struct PasskeyRegistrationRequest {
    relying_party_id: String,
    user_name: String,
    user_handle: Vec<u8>,

    client_data_hash: Vec<u8>,
    user_verification: UserVerification,
}

#[derive(uniffi::Record)]
pub struct PasskeyRegistrationCredential {
    relying_party: String,
    client_data_hash: Vec<u8>,
    credential_id: Vec<u8>,
    attestation_object: Vec<u8>,
}

#[derive(uniffi::Error)]
pub enum BitwardenError {
    Internal(String),
}

#[uniffi::export(with_foreign)]
pub trait PreparePasskeyRegistrationCallback: Send + Sync {
    fn on_complete(&self, credential: PasskeyRegistrationCredential);
    fn on_error(&self, error: BitwardenError);
}

#[uniffi::export]
impl MacOSProviderClient {
    #[allow(clippy::new_without_default)]
    #[uniffi::constructor]
    pub fn new() -> Self {
        let _ = oslog::OsLogger::new("com.bitwarden.desktop.autofill-extension")
            .level_filter(log::LevelFilter::Info)
            .init();

        MacOSProviderClient {}
    }

    pub fn prepare_passkey_registration(
        &self,
        request: PasskeyRegistrationRequest,
        callback: Arc<dyn PreparePasskeyRegistrationCallback>,
    ) {
        log::warn!("prepare_passkey_registration: {:?}", request);
    }
}
