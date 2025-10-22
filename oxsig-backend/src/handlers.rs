// HTTP handlers for REST endpoints
use axum::{extract::State, Json};
use serde_json::Value;

use crate::AppState;

pub async fn handle_health() -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok"
    }))
}
