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

    // Checks if the os secure storage is available
    #[napi]
    pub async fn is_available() -> napi::Result<bool> {
        desktop_core::password::is_available().map_err(|e| napi::Error::from_reason(e.to_string()))
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
        Biometric::prompt(hwnd.into(), message).await.map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn available() -> napi::Result<bool> {
        Biometric::available().await.map_err(|e| napi::Error::from_reason(e.to_string()))
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
pub mod sshagent {
    use std::sync::Arc;

    use napi::{
        bindgen_prelude::Promise,
        threadsafe_function::{ErrorStrategy::CalleeHandled, ThreadsafeFunction}, Error,
    };
    use rand_chacha::ChaCha8Rng;
    use ssh_key::{rand_core::SeedableRng, Algorithm, HashAlg, LineEnding};
    use tokio::{self, sync::Mutex};

    #[napi(object)]
    pub struct PrivateKey {
        pub private_key: String,
        pub name: String,
        pub uuid: String,
    }

    #[napi(object)]
    pub struct SSHKey {
        pub private_key: String,
        pub public_key: String,
        pub key_algorithm: String,
        pub key_fingerprint: String,
    }

    #[napi]
    pub async fn serve(callback: ThreadsafeFunction<String, CalleeHandled>) -> napi::Result<()> {
        let (auth_request_tx, mut auth_request_rx) = tokio::sync::mpsc::channel::<String>(32);
        let (auth_response_tx, auth_response_rx) = tokio::sync::mpsc::channel::<bool>(32);
        tokio::spawn(async move {
            while let Some(message) = auth_request_rx.recv().await {
                let promise_result: Result<Promise<bool>, napi::Error> = callback.call_async(Ok(message)).await;
                if let Err(e) = promise_result {
                    println!("[SSH Agent Native Module] calling UI callback could not create promise: {}", e);
                    let _ = auth_response_tx.send(false).await;
                } else {
                    let result = promise_result.unwrap().await;
                    if let Err(e) = result {
                        println!(
                            "[SSH Agent Native Module] calling UI callback promise was rejected: {}",
                            e
                        );
                        let _ = auth_response_tx.send(false).await;
                    } else {
                        let _ = auth_response_tx.send(result.unwrap()).await;
                    }
                }
            }
        });

        match desktop_core::ssh_agent::start_server(auth_request_tx, Arc::new(Mutex::new(auth_response_rx))).await {
            Ok(_) => Ok(()),
            Err(e) => Err(napi::Error::from_reason(e.to_string())),
        }
    }
    #[napi]
    pub async fn set_keys(new_keys: Vec<PrivateKey>) -> napi::Result<()> {
        desktop_core::ssh_agent::set_keys(
            new_keys
                .iter()
                .map(|k| (k.private_key.clone(), k.name.clone(), k.uuid.clone()))
                .collect(),
        )
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(())
    }

    #[napi]
    pub async fn lock() -> napi::Result<()> {
        desktop_core::ssh_agent::lock().await.map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn generate_keypair(key_algorithm: String) -> napi::Result<SSHKey> {
        // sourced from cryptographically secure entropy source, with sources for all targets: https://docs.rs/getrandom
        // if it cannot be securely sourced, this will panic instead of leading to a weak key
        let mut rng: ChaCha8Rng = ChaCha8Rng::from_entropy();

        let key = match key_algorithm.as_str() {
            "ed25519" => ssh_key::PrivateKey::random(&mut rng, Algorithm::Ed25519).or_else(|e| Err(napi::Error::from_reason(e.to_string()))),
            "rsa2048" | "rsa3072" | "rsa4096" => {
                let bits = match key_algorithm.as_str() {
                    "rsa2048" => 2048,
                    "rsa3072" => 3072,
                    "rsa4096" => 4096,
                    _ => Err(napi::Error::from_reason("Unsupported RSA key size".to_string()))?,
                };
                let rsa_keypair: Result<ssh_key::private::RsaKeypair, Error> = ssh_key::private::RsaKeypair::random(&mut rng, bits).or_else(|e| Err(napi::Error::from_reason(e.to_string()))?);
                let rsa_keypair = rsa_keypair?;
                let private_key = ssh_key::PrivateKey::new(ssh_key::private::KeypairData::from(rsa_keypair), "".to_string()).or_else(|e| Err(napi::Error::from_reason(e.to_string())));
                private_key
            }
            _ => {
                return Err(napi::Error::from_reason(
                    "Unsupported key algorithm".to_string(),
                ))
            }
        };
        
        match key {
            Ok(key) => {
                let public_key = key.public_key();
                let public_key_base64 = public_key.to_string();
                let private_key_openssh = key.to_openssh(LineEnding::LF);
                let private_key_openssh_string = private_key_openssh.unwrap().to_string();
                let fingerprint = key.fingerprint(HashAlg::Sha256);
                let fingerprint_string = fingerprint.to_string();
                Ok(SSHKey {
                    private_key: private_key_openssh_string,
                    public_key: public_key_base64,
                    key_algorithm: key_algorithm.to_string(),
                    key_fingerprint: fingerprint_string,
                })
            },
            Err(e) => Err(napi::Error::from_reason(e.to_string())),
        }
    }

}

#[napi]
pub mod processisolations {
    #[napi]
    pub async fn disable_coredumps() -> napi::Result<()> {
        desktop_core::process_isolation::disable_coredumps()
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
    #[napi]
    pub async fn is_core_dumping_disabled() -> napi::Result<bool> {
        desktop_core::process_isolation::is_core_dumping_disabled()
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
    #[napi]
    pub async fn disable_memory_access() -> napi::Result<()> {
        desktop_core::process_isolation::disable_memory_access()
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

#[napi]
pub mod powermonitors {
    use napi::{
        threadsafe_function::{
            ErrorStrategy::CalleeHandled, ThreadsafeFunction, ThreadsafeFunctionCallMode,
        },
        tokio,
    };

    #[napi]
    pub async fn on_lock(callback: ThreadsafeFunction<(), CalleeHandled>) -> napi::Result<()> {
        let (tx, mut rx) = tokio::sync::mpsc::channel::<()>(32);
        desktop_core::powermonitor::on_lock(tx)
            .await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        tokio::spawn(async move {
            while let Some(message) = rx.recv().await {
                callback.call(Ok(message.into()), ThreadsafeFunctionCallMode::NonBlocking);
            }
        });
        Ok(())
    }

    #[napi]
    pub async fn is_lock_monitor_available() -> napi::Result<bool> {
        Ok(desktop_core::powermonitor::is_lock_monitor_available().await)
    }
}
