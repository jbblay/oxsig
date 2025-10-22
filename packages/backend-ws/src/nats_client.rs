// NATS client wrapper
use async_nats::Client;
use anyhow::Result;

pub struct NatsClient {
    client: Client,
}

impl NatsClient {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn publish(&self, subject: &str, payload: Vec<u8>) -> Result<()> {
        self.client.publish(subject.to_string(), payload.into()).await?;
        Ok(())
    }

    pub async fn subscribe(&self, subject: &str) -> Result<async_nats::Subscriber> {
        Ok(self.client.subscribe(subject.to_string()).await?)
    }
}
