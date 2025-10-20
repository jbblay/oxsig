// Redis client wrapper
use redis::{Client, AsyncCommands};
use anyhow::Result;

pub struct RedisClient {
    client: Client,
}

impl RedisClient {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn set(&self, key: &str, value: &str, expiry_secs: Option<u64>) -> Result<()> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        
        if let Some(secs) = expiry_secs {
            conn.set_ex(key, value, secs).await?;
        } else {
            conn.set(key, value).await?;
        }
        
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        let value: Option<String> = conn.get(key).await?;
        Ok(value)
    }

    pub async fn delete(&self, key: &str) -> Result<()> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        conn.del(key).await?;
        Ok(())
    }
}
