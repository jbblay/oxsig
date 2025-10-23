# OxSig Backend - Production Dockerfile for Railway
# Optimized multi-stage build

FROM rust:1.86-slim-bookworm AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock* ./

# Create dummy src to build dependencies (cache layer)
RUN mkdir -p src && \
    echo "fn main() {println!(\"dummy\");}" > src/main.rs && \
    cargo build --release || true && \
    rm -rf src

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build actual binary
RUN cargo build --release && \
    strip target/release/oxsig-ws-gateway

# ============================================
# Runtime Stage - Minimal
# ============================================
FROM debian:bookworm-slim

WORKDIR /app

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy binary from builder
COPY --from=builder /build/target/release/oxsig-ws-gateway /usr/local/bin/oxsig-ws-gateway

# Make binary executable
RUN chmod +x /usr/local/bin/oxsig-ws-gateway

# Create non-root user
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Environment defaults (Railway will override)
ENV RUST_LOG=info \
    RUST_BACKTRACE=1 \
    PORT=8080 \
    HOST=0.0.0.0

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start the application
CMD ["/usr/local/bin/oxsig-ws-gateway"]
