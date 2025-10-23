use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn, error};
use uuid::Uuid;

mod api;
mod config;
mod db;
mod metrics;
mod models;
mod search;
mod storage;

use config::Config;
use metrics::{gather_metrics, init_metrics, CONNECTED_CLIENTS, MESSAGES_RECEIVED, MESSAGES_SENT};
use search::SearchService;
use storage::StorageService;
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use std::collections::BTreeMap;

// Message types for WebRTC signaling
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum SignalMessage {
    Offer {
        from: String,
        to: String,
        sdp: String,
    },
    Answer {
        from: String,
        to: String,
        sdp: String,
    },
    IceCandidate {
        from: String,
        to: String,
        candidate: String,
    },
    Join {
        room: String,
        user_id: String,
    },
    Leave {
        room: String,
        user_id: String,
    },
    Message {
        from: String,
        to: Option<String>,
        room: Option<String>,
        data: serde_json::Value,
    },
}

// Application state
#[derive(Clone)]
pub struct AppState {
    rooms: Arc<RwLock<HashMap<String, Vec<String>>>>,
    tx: broadcast::Sender<SignalMessage>,
    pub db: PgPool,
    pub storage: Arc<StorageService>,
    pub search: Arc<SearchService>,
    pub jwt_secret: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .compact()
        .init();

    info!("🚀 Starting OxSig Backend v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    dotenv::dotenv().ok();
    let config = Config::from_env()?;
    info!("✓ Configuration loaded");

    // Initialize database
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://oxsig:changeme@localhost:5432/oxsig".to_string());
    
    let db = db::create_pool(&db_url).await?;
    info!("✓ Database connected");

    // Run migrations
    info!("🔄 Running database migrations...");
    db::run_migrations(&db).await.expect("Failed to run database migrations");
    info!("✓ Migrations completed");

    // Initialize storage (S3/MinIO)
    info!("📦 Initializing storage service...");
    let storage = match StorageService::new(
        &std::env::var("STORAGE_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string()),
        &std::env::var("STORAGE_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string()),
        &std::env::var("STORAGE_SECRET_KEY").unwrap_or_else(|_| "minioadmin".to_string()),
        &std::env::var("STORAGE_BUCKET").unwrap_or_else(|_| "oxsig".to_string()),
        &std::env::var("STORAGE_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
    ).await {
        Ok(s) => {
            info!("✓ Storage service initialized");
            Arc::new(s)
        }
        Err(e) => {
            error!("❌ Storage initialization failed: {}", e);
            error!("⚠️  Continuing without storage - uploads will fail");
            // Create dummy storage
            Arc::new(StorageService::new("http://localhost:9000", "dummy", "dummy", "dummy", "us-east-1").await?)
        }
    };

    // Initialize search (MeiliSearch)
    info!("🔍 Initializing search service...");
    let search = match SearchService::new(
        &std::env::var("SEARCH_URL").unwrap_or_else(|_| "http://localhost:7700".to_string()),
        &std::env::var("SEARCH_KEY").unwrap_or_else(|_| "".to_string()),
    ).await {
        Ok(s) => {
            info!("✓ Search service initialized");
            Arc::new(s)
        }
        Err(e) => {
            error!("❌ Search initialization failed: {}", e);
            error!("⚠️  Continuing without search - search features will be disabled");
            // Create dummy search
            Arc::new(SearchService::new("http://localhost:7700", "").await?)
        }
    };

    // Create broadcast channel for WebSocket messages
    let (tx, _rx) = broadcast::channel::<SignalMessage>(1000);

    // JWT secret
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "your_secret_key_here_change_in_production".to_string());

    // Initialize app state
    let state = Arc::new(AppState {
        rooms: Arc::new(RwLock::new(HashMap::new())),
        tx,
        db,
        storage,
        search,
        jwt_secret,
    });

    // Initialize metrics
    init_metrics();
    info!("✓ Metrics initialized");

    // Setup CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build API router
    let api_router = Router::new()
        // Auth routes
        .route("/auth/register", post(api::register))
        .route("/auth/login", post(api::login))
        // Document routes
        .route("/documents", get(api::list_documents).post(api::upload_document))
        .route("/documents/:id", get(api::get_document).delete(api::delete_document))
        // Search route
        .route("/search", get(api::search_documents));

    // Build main router
    let app = Router::new()
        // WebSocket endpoint
        .route("/ws", get(ws_handler))
        // Health and metrics
        .route("/health", get(health_handler))
        .route("/metrics", get(metrics_handler))
        .route("/rooms", get(list_rooms))
        // API routes under /api
        .nest("/api", api_router)
        .with_state(state)
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http());

    // Get port from environment
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    
    info!("✅ OxSig Backend ready!");
    info!("🌐 WebSocket gateway: ws://0.0.0.0:{}/ws", port);
    info!("🏥 Health check: http://0.0.0.0:{}/health", port);
    info!("📊 Metrics: http://0.0.0.0:{}/metrics", port);
    info!("🔌 API endpoints: http://0.0.0.0:{}/api/*", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Check database health
    let db_healthy = sqlx::query("SELECT 1").fetch_one(&state.db).await.is_ok();

    Json(serde_json::json!({
        "status": "healthy",
        "service": "oxsig-backend",
        "version": env!("CARGO_PKG_VERSION"),
        "services": {
            "database": db_healthy,
            "storage": true, // Could add actual health check
            "search": true,  // Could add actual health check
        }
    }))
}

async fn metrics_handler() -> impl IntoResponse {
    let body = gather_metrics();
    (
        [("Content-Type", "text/plain; version=0.0.4")],
        body,
    )
}

async fn list_rooms(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let rooms = state.rooms.read().await;
    Json(rooms.clone())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(params): Query<BTreeMap<String, String>>,
) -> impl IntoResponse {
    // Optional JWT verification
    if std::env::var("WS_REQUIRE_AUTH").ok().map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false) {
        if let Some(token) = params.get("token") {
            let key = DecodingKey::from_secret(state.jwt_secret.as_bytes());
            let validation = Validation::new(Algorithm::HS256);
            if decode::<serde_json::Value>(token, &key, &validation).is_err() {
                return (axum::http::StatusCode::UNAUTHORIZED, "invalid token").into_response();
            }
        } else {
            return (axum::http::StatusCode::UNAUTHORIZED, "missing token").into_response();
        }
    }

    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();
    let client_id = Uuid::new_v4().to_string();

    info!("New WebSocket connection: {}", client_id);
    CONNECTED_CLIENTS.inc();

    let (pong_tx, mut pong_rx) = tokio::sync::mpsc::channel::<String>(10);

    // Spawn task to handle broadcasting
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Ok(msg) = rx.recv() => {
                    if let Ok(json) = serde_json::to_string(&msg) {
                        if sender.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                        MESSAGES_SENT.inc();
                    }
                }
                Some(pong) = pong_rx.recv() => {
                    if sender.send(Message::Text(pong)).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Spawn task to handle receiving
    let tx = state.tx.clone();
    let client_id_clone = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Handle ping/pong
                    if text == "{\"type\":\"ping\"}" || text.trim() == "ping" {
                        let _ = pong_tx.send("{\"type\":\"pong\"}".to_string()).await;
                        continue;
                    }

                    if let Ok(signal_msg) = serde_json::from_str::<SignalMessage>(&text) {
                        info!("Received message from {}: {:?}", client_id_clone, signal_msg);
                        MESSAGES_RECEIVED.inc();
                        
                        if tx.send(signal_msg.clone()).is_err() {
                            warn!("Failed to broadcast message");
                        }

                        match signal_msg {
                            SignalMessage::Join { room, user_id } => {
                                info!("User {} joined room {}", user_id, room);
                            }
                            SignalMessage::Leave { room, user_id } => {
                                info!("User {} left room {}", user_id, room);
                            }
                            _ => {}
                        }
                    }
                }
                Message::Close(_) => {
                    info!("Client {} disconnected", client_id_clone);
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    info!("WebSocket connection closed: {}", client_id);
    CONNECTED_CLIENTS.dec();
}
