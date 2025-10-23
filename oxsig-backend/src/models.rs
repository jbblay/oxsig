// Database models and types
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================================
// User Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub email: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

// ============================================================================
// Document Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Document {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub storage_key: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocument {
    pub title: String,
    pub description: Option<String>,
    pub mime_type: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDocument {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
}

// ============================================================================
// Signature Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Signature {
    pub id: Uuid,
    pub document_id: Uuid,
    pub user_id: Uuid,
    pub signature_data: String,
    pub signature_type: String,
    pub public_key: Option<String>,
    pub signed_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateSignature {
    pub document_id: Uuid,
    pub signature_data: String,
    pub signature_type: String,
    pub public_key: Option<String>,
}

// ============================================================================
// Audit Log Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<Uuid>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

// ============================================================================
// WebRTC/Pairing Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DevicePairing {
    pub id: Uuid,
    pub user_id: Uuid,
    pub device_id: String,
    pub device_name: Option<String>,
    pub public_key: String,
    pub challenge_hash: Option<String>,
    pub paired_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub metadata: serde_json::Value,
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}
