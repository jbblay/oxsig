// Prometheus metrics
use prometheus::{Encoder, TextEncoder, Counter, Gauge, Registry};
use lazy_static::lazy_static;

lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();
    
    pub static ref CONNECTED_CLIENTS: Gauge = Gauge::new(
        "oxsig_connected_clients", 
        "Number of connected WebSocket clients"
    ).unwrap();
    
    pub static ref MESSAGES_SENT: Counter = Counter::new(
        "oxsig_messages_sent_total",
        "Total number of messages sent"
    ).unwrap();
    
    pub static ref MESSAGES_RECEIVED: Counter = Counter::new(
        "oxsig_messages_received_total",
        "Total number of messages received"
    ).unwrap();
}

pub fn init_metrics() {
    REGISTRY.register(Box::new(CONNECTED_CLIENTS.clone())).unwrap();
    REGISTRY.register(Box::new(MESSAGES_SENT.clone())).unwrap();
    REGISTRY.register(Box::new(MESSAGES_RECEIVED.clone())).unwrap();
}

pub fn gather_metrics() -> String {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buffer = vec![];
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}
