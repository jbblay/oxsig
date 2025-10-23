// HTTP handlers for REST endpoints
use axum::Json;
use serde_json::Value;

pub async fn handle_health() -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok"
    }))
}
