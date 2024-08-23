use std::{borrow::BorrowMut, future::Future, io, pin::Pin, rc::Rc, sync::RwLock, task::{Context, Poll}};

use futures::Stream;
use tokio::{net::windows::named_pipe::{NamedPipeServer, ServerOptions}, sync::Mutex};

type ConnectFuture = Pin<Box<dyn Future<Output = Result<(), io::Error>>>>;

const PIPE_NAME: &str = r"\\.\pipe\named-pipe-idiomatic-server";

#[pin_project::pin_project]
pub struct NamedPipeServerStream {
    inner: Rc<NamedPipeServer>,
    // rw
    connect_future: Option<ConnectFuture>,
}

impl NamedPipeServerStream {
    /// Create a new `NamedPipeServerStream`.
    pub fn new(listener: NamedPipeServer) -> Self {
        Self {
            inner: Rc::new(listener),
            connect_future: None,
        }
    }

    /// Get back the inner `NamedPipeSerer`.
    pub fn into_inner(self) -> Rc<NamedPipeServer> {
        self.inner
    }
}

impl Stream for NamedPipeServerStream {
    type Item = io::Result<NamedPipeServer>;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<io::Result<NamedPipeServer>>> {
        let mut this = self.project();

        if (this.connect_future.is_none()) {
            let mut namedpipeserer: &'static Rc<NamedPipeServer>  = Rc::new(ServerOptions::new().create(PIPE_NAME).unwrap());
            let temp = Box::pin(namedpipeserer.connect());
            *this.connect_future = Some(temp);
        }


        let connect_future = this.connect_future.as_mut().unwrap();
        match connect_future.as_mut().poll(cx) {
            Poll::Ready(Ok(())) => {
                // todo: create new inner server return the old one
                Poll::Ready(None)
            },
            Poll::Ready(Err(err)) => Poll::Ready(Some(Err(err))),
            Poll::Pending => Poll::Pending,
        }
    }
}
