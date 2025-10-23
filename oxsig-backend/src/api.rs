// API route handlers
use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    models::*,
    search::{SearchService, SearchableDocument},
    storage::StorageService,
    AppState,
};

// ============================================================================
// Auth Handlers
// ============================================================================

#[derive(Debug, Serialize)]
struct Claims {
    sub: String, // user id
    exp: usize,  // expiration
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateUser>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    // Hash password
    let password_hash = hash(payload.password, DEFAULT_COST)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create user
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, username, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, email, username, password_hash, created_at, updated_at, last_login_at, is_active
        "#,
    )
    .bind(&payload.email)
    .bind(&payload.username)
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, format!("User creation failed: {}", e)))?;

    // Generate JWT
    let token = generate_token(&user.id, &state.jwt_secret)?;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    // Find user
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1 AND is_active = true"
    )
    .bind(&payload.email)
    .fetch_one(&state.db)
    .await
    .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()))?;

    // Verify password
    verify(&payload.password, &user.password_hash)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()))?;

    // Update last login
    sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await
        .ok();

    // Generate JWT
    let token = generate_token(&user.id, &state.jwt_secret)?;

    Ok(Json(AuthResponse { token, user }))
}

fn generate_token(user_id: &Uuid, secret: &str) -> Result<String, (StatusCode, String)> {
    let expiration = (Utc::now() + chrono::Duration::hours(24)).timestamp() as usize;
    
    let claims = Claims {
        sub: user_id.to_string(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ============================================================================
// Document Handlers
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ListDocumentsQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub status: Option<String>,
}

pub async fn list_documents(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListDocumentsQuery>,
) -> Result<Json<PaginatedResponse<Document>>, (StatusCode, String)> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20).min(100);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT * FROM documents WHERE 1=1".to_string();
    if let Some(status) = &query.status {
        sql.push_str(&format!(" AND status = '{}'", status));
    }
    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {} OFFSET {}", per_page, offset));

    let documents = sqlx::query_as::<_, Document>(&sql)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM documents")
        .fetch_one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(PaginatedResponse {
        data: documents,
        total: total.0,
        page,
        per_page,
    }))
}

pub async fn get_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Document>, (StatusCode, String)> {
    let document = sqlx::query_as::<_, Document>(
        "SELECT * FROM documents WHERE id = $1"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| (StatusCode::NOT_FOUND, "Document not found".to_string()))?;

    Ok(Json(document))
}

pub async fn upload_document(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<Document>, (StatusCode, String)> {
    let mut title = String::new();
    let mut description = None;
    let mut file_data = None;
    let mut filename = String::new();
    let mut content_type = String::from("application/octet-stream");

    // Parse multipart form
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or("").to_string();
        
        match name.as_str() {
            "title" => title = field.text().await.unwrap(),
            "description" => description = Some(field.text().await.unwrap()),
            "file" => {
                filename = field.file_name().unwrap_or("unnamed").to_string();
                content_type = field.content_type().unwrap_or("application/octet-stream").to_string();
                file_data = Some(field.bytes().await.unwrap());
            }
            _ => {}
        }
    }

    let file_bytes = file_data
        .ok_or((StatusCode::BAD_REQUEST, "No file provided".to_string()))?;
    let file_size = file_bytes.len() as i64;

    // Upload to storage
    let storage_key = state.storage
        .upload(file_bytes, &filename, &content_type)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create document record
    // TODO: Get user_id from JWT auth
    let user_id = Uuid::new_v4(); // Placeholder

    let document = sqlx::query_as::<_, Document>(
        r#"
        INSERT INTO documents (user_id, title, description, file_path, file_size, mime_type, storage_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(&title)
    .bind(&description)
    .bind(&filename)
    .bind(file_size)
    .bind(&content_type)
    .bind(&storage_key)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Index in search
    let search_doc = SearchableDocument {
        id: document.id.to_string(),
        title: document.title.clone(),
        description: document.description.clone(),
        user_id: document.user_id.to_string(),
        status: document.status.clone(),
        created_at: document.created_at.timestamp(),
    };
    state.search.index_document(search_doc).await.ok();

    Ok(Json(document))
}

pub async fn delete_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Get document
    let document: Document = sqlx::query_as("SELECT * FROM documents WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Document not found".to_string()))?;

    // Delete from storage
    state.storage.delete(&document.storage_key).await.ok();

    // Delete from database
    sqlx::query("DELETE FROM documents WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Delete from search index
    state.search.delete_document(&id.to_string()).await.ok();

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Search Handler
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

pub async fn search_documents(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchableDocument>>, (StatusCode, String)> {
    let results = state.search
        .search(
            &query.q,
            None,
            query.limit.unwrap_or(20),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(results))
}
