use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};
use uuid::Uuid;

mod config;
mod handlers;
mod metrics;

use config::Config;
use metrics::{gather_metrics, init_metrics, CONNECTED_CLIENTS, MESSAGES_RECEIVED, MESSAGES_SENT};
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

// Application state (simplified - no external dependencies required)
#[derive(Clone)]
struct AppState {
    rooms: Arc<RwLock<HashMap<String, Vec<String>>>>,
    tx: broadcast::Sender<SignalMessage>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing first
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .compact()
        .init();

    info!("🚀 Starting OxSig WebSocket Gateway v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration with .env file support
    dotenv::dotenv().ok();
    let _config = Config::from_env()?;
    info!("✓ Configuration loaded");

    // Create broadcast channel for WebSocket messages
    let (tx, _rx) = broadcast::channel::<SignalMessage>(1000);

    // Initialize app state (no external dependencies required)
    let state = AppState {
        rooms: Arc::new(RwLock::new(HashMap::new())),
        tx,
    };

    // Initialize metrics
    init_metrics();
    info!("✓ Metrics initialized");

    // Setup CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health_handler))
        .route("/metrics", get(metrics_handler))
        .route("/rooms", get(list_rooms))
        .with_state(state)
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http());

    // Get port from environment or use default
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    
    info!("✓ WebSocket gateway listening on {}", addr);
    info!("✓ Health check available at http://0.0.0.0:{}/health", port);
    info!("✓ Metrics available at http://0.0.0.0:{}/metrics", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "oxsig-ws-gateway",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn metrics_handler() -> impl IntoResponse {
    let body = gather_metrics();
    (
        [("Content-Type", "text/plain; version=0.0.4")],
        body,
    )
}

async fn list_rooms(State(state): State<AppState>) -> impl IntoResponse {
    let rooms = state.rooms.read().await;
    Json(rooms.clone())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(params): Query<BTreeMap<String, String>>,
) -> impl IntoResponse {
    // Optional JWT verification from query param `token`
    if std::env::var("WS_REQUIRE_AUTH").ok().map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false) {
        if let Some(token) = params.get("token") {
            let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your_secret_key_here".to_string());
            let key = DecodingKey::from_secret(secret.as_bytes());
            // Accept HS256 only by default
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

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();
    let client_id = Uuid::new_v4().to_string();

    info!("New WebSocket connection: {}", client_id);

    // Track connected clients
    CONNECTED_CLIENTS.inc();

    // Create a channel for sending pong responses
    let (pong_tx, mut pong_rx) = tokio::sync::mpsc::channel::<String>(10);

    // Spawn task to handle broadcasting messages to this client
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                // Handle broadcast messages
                Ok(msg) = rx.recv() => {
                    if let Ok(json) = serde_json::to_string(&msg) {
                        if sender.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                        MESSAGES_SENT.inc();
                    }
                }
                // Handle pong responses
                Some(pong) = pong_rx.recv() => {
                    if sender.send(Message::Text(pong)).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Spawn task to handle receiving messages from this client
    let tx = state.tx.clone();
    let client_id_clone = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Basic ping/pong support for keepalive
                    if text == "{\"type\":\"ping\"}" || text.trim() == "ping" {
                        let _ = pong_tx.send("{\"type\":\"pong\"}".to_string()).await;
                        continue;
                    }

                    if let Ok(signal_msg) = serde_json::from_str::<SignalMessage>(&text) {
                        info!("Received message from {}: {:?}", client_id_clone, signal_msg);
                        MESSAGES_RECEIVED.inc();
                        
                        // Broadcast to all connected clients
                        if tx.send(signal_msg.clone()).is_err() {
                            warn!("Failed to broadcast message");
                        }

                        // Handle specific message types
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
