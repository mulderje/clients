use std::{borrow::BorrowMut, future::Future, io, pin::Pin, task::{Context, Poll}};

use futures::Stream;
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

type ConnectFuture = Pin<Box<dyn Future<Output = Result<(), io::Error>>>>;

const PIPE_NAME: &str = r"\\.\pipe\named-pipe-idiomatic-server";

pub struct NamedPipeServerStream {
    inner: NamedPipeServer,
    connect_future: Option<ConnectFuture>,
}

impl NamedPipeServerStream {
    /// Create a new `NamedPipeServerStream`.
    pub fn new(listener: NamedPipeServer) -> Self {
        Self {
            inner: listener,
            connect_future: None,
        }
    }

    /// Get back the inner `NamedPipeSerer`.
    pub fn into_inner(self) -> NamedPipeServer {
        self.inner
    }
}

impl Stream for NamedPipeServerStream {
    type Item = io::Result<NamedPipeServer>;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<io::Result<NamedPipeServer>>> {
        if (self.connect_future.is_none()) {
            let r = Pin::into_inner(self);
            r.connect_future = Some(Box::pin(self.inner.connect()));
        }
        let connect_future = self.connect_future.as_mut().unwrap();

        match connect_future.as_mut().poll(cx) {
            Poll::Ready(Ok(())) => {
                //self.connect_future = None;
                //let connected_client = self.inner;

                //self.inner = ServerOptions::new().create(PIPE_NAME).unwrap();
                Poll::Ready(None)
            },
            Poll::Ready(Err(err)) => Poll::Ready(Some(Err(err))),
            Poll::Pending => Poll::Pending,
        }
    }
}
