use std::sync::Arc;

use anyhow::Error;
use async_stream::stream;
use futures::stream::{Stream, StreamExt};

use ssh_agent::Key;
use std::collections::HashMap;
use std::sync::RwLock;
use tokio::sync::Mutex;

pub mod msg;
pub mod ssh_agent;
pub mod russh_encoding;
pub mod namedpipelistenerstream;

#[cfg(unix)]
use tokio::net::UnixListener;
#[cfg(unix)]
use homedir::my_home;

static KEYSTORE: std::sync::LazyLock<ssh_agent::KeyStore> =
    std::sync::LazyLock::new(|| ssh_agent::KeyStore(Arc::new(RwLock::new(HashMap::new()))));

#[derive(Clone)]
struct SecureAgent {
    send_tx: tokio::sync::mpsc::Sender<String>,
    response_rx: Arc<Mutex<tokio::sync::mpsc::Receiver<bool>>>,
}

impl ssh_agent::Agent for SecureAgent {
    async fn confirm(&self, ssh_key: Key) -> bool {
        // make sure we will recv our response by locking the channel
        let mut rx_channel = self.response_rx.lock().await;
        self.send_tx.send(ssh_key.cipher_uuid.clone()).await.unwrap();
        let res = rx_channel.recv().await.unwrap();
        res
    }
}

#[cfg(unix)]
pub async fn start_server(
    auth_request_tx: tokio::sync::mpsc::Sender<String>,
    auth_response_rx: Arc<Mutex<tokio::sync::mpsc::Receiver<bool>>>,
) -> Result<(), anyhow::Error> {
    let env_path = std::env::var("BITWARDEN_SSH_AUTH_SOCK");
    let ssh_path = match env_path {
        Ok(path) => path,
        Err(_) => {
            println!("[SSH Agent Native Module] BITWARDEN_SSH_AUTH_SOCK not set, using default path");
            my_home()?.ok_or(Error::msg("Could not determine home directory"))?
                .join(".bitwarden-ssh-agent.sock")
                .to_str()
                .ok_or(Error::msg("Could not determine home directory"))?
                .to_string()
        }
    };
    println!("[SSH Agent Native Module] Starting SSH Agent server on {:?}", ssh_path);
    let sockname = std::path::Path::new(&ssh_path);
    std::fs::remove_file(sockname).unwrap_or_default();

    match UnixListener::bind(sockname) {
        Ok(listener) => {
            let wrapper = tokio_stream::wrappers::UnixListenerStream::new(listener);
            ssh_agent::serve(
                wrapper,
                SecureAgent {
                    send_tx: auth_request_tx,
                    response_rx: auth_response_rx,
                },
                KEYSTORE.clone(),
            )
            .await?;
            println!("[SSH Agent Native Module] SSH Agent server exited");
        }
        Err(e) => {
            eprintln!("[SSH Agent Native Module] Error while starting agent server: {}", e);
        }
    }
    Ok(())
}

#[cfg(windows)]
use tokio::net::windows::named_pipe::ServerOptions;

#[cfg(windows)]
pub async fn start_server(
    auth_request_tx: tokio::sync::mpsc::Sender<String>,
    auth_response_rx: Arc<Mutex<tokio::sync::mpsc::Receiver<bool>>>,
) -> Result<(), anyhow::Error> {
    println!("[SSH Agent Native Module] Windows is not supported yet");
    use std::io;
    use futures::stream;
    use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

    const PIPE_NAME: &str = r"\\.\pipe\named-pipe-idiomatic-server";

    let mut server = ServerOptions::new()
        .first_pipe_instance(true)
        .create(PIPE_NAME)?;

// Spawn the server loop.
    let server = tokio::spawn(async move {
        server.connect().await.unwrap();
        let connected_client = server;
        server = ServerOptions::new().create(PIPE_NAME).unwrap();
        connected_client.

        Ok::<_, io::Error>(())
    });
    Ok(())
}

pub async fn set_keys(new_keys: Vec<(String, String, String)>) -> Result<(), anyhow::Error> {
    (&KEYSTORE).0.write().unwrap().clear();

    for (key, name, uuid) in new_keys.iter() {
        let private_key = ssh_key::private::PrivateKey::from_openssh(&key).unwrap();
        let public_key_bytes = private_key.public_key().to_bytes().unwrap();

        let keys = &KEYSTORE;
        keys.0.write().unwrap().insert(
            public_key_bytes,
            Key {
                private_key: Some(private_key),
                name: name.clone(),
                cipher_uuid: uuid.clone(),
            },
        );
    }

    Ok(())
}

pub async fn lock() -> Result<(), anyhow::Error> {
    let keystore = &mut KEYSTORE.0.write().unwrap();
    let tmp_hashmap = keystore.clone();
    // wipe keypairs (private keys) but keep the public keys so we can list keys
    for (public_key_bytes, key) in tmp_hashmap.iter() {
        keystore.insert(public_key_bytes.to_vec(), Key {
            private_key: None,
            name: key.name.clone(),
            cipher_uuid: key.cipher_uuid.clone(),
        });
    }
    Ok(())
}

