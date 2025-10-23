use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub jwt_secret: String,
    pub require_auth: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| {
                    tracing::warn!("JWT_SECRET not set, using default (insecure!)");
                    "change-me-in-production".to_string()
                }),
            require_auth: std::env::var("WS_REQUIRE_AUTH")
                .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE"))
                .unwrap_or(false),
        })
    }
}
