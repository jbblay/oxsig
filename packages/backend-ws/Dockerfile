# =========================
# 🏗️  Build Stage
# =========================
FROM rustlang/rust:nightly-slim AS builder
# (or use `rust:1.85-slim` when available)

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for caching
COPY Cargo.toml Cargo.lock ./

# Pre-build dependencies (dummy main)
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

# Copy the actual source code last (so dependency cache is preserved)
COPY src ./src

# Build the final binary
RUN cargo build --release

# =========================
# 🚀 Runtime Stage
# =========================
FROM debian:bookworm-slim

WORKDIR /app

# Install only the minimal runtime libs
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled binary from the builder stage
COPY --from=builder /app/target/release/oxsig-ws-gateway /usr/local/bin/oxsig-ws-gateway

# Expose your app ports
EXPOSE 8080 9090

# Ensure stdout/stderr are unbuffered
ENV RUST_LOG=info
ENV RUST_BACKTRACE=1

# Start the service
CMD ["oxsig-ws-gateway"]
