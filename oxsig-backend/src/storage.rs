// Storage service using S3/MinIO
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::{Builder, Region},
    Client,
    primitives::ByteStream,
};
use bytes::Bytes;
use std::path::Path;
use uuid::Uuid;

pub struct StorageService {
    client: Client,
    bucket: String,
}

impl StorageService {
    pub async fn new(
        endpoint: &str,
        access_key: &str,
        secret_key: &str,
        bucket: &str,
        region: &str,
    ) -> Result<Self, anyhow::Error> {
        let credentials = Credentials::new(
            access_key,
            secret_key,
            None,
            None,
            "static",
        );

        let config = Builder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(region.to_string()))
            .endpoint_url(endpoint)
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        let client = Client::from_conf(config);

        Ok(Self {
            client,
            bucket: bucket.to_string(),
        })
    }

    pub async fn upload(
        &self,
        data: Bytes,
        filename: &str,
        content_type: &str,
    ) -> Result<String, anyhow::Error> {
        let key = format!("{}/{}", Uuid::new_v4(), filename);
        
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(ByteStream::from(data))
            .content_type(content_type)
            .send()
            .await?;

        Ok(key)
    }

    pub async fn download(&self, key: &str) -> Result<Bytes, anyhow::Error> {
        let output = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        let data = output.body.collect().await?;
        Ok(data.into_bytes())
    }

    pub async fn delete(&self, key: &str) -> Result<(), anyhow::Error> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        Ok(())
    }

    pub fn get_public_url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.client.config().endpoint_url().unwrap(), self.bucket, key)
    }
}
