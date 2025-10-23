# OxSig Backend - Development Dockerfile
# Simpler build for local testing

FROM rust:1.75-slim-bookworm AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy source
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

# Build
RUN cargo build --release

# Runtime
FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/oxsig-ws-gateway /usr/local/bin/oxsig-ws-gateway
RUN chmod +x /usr/local/bin/oxsig-ws-gateway

ENV RUST_LOG=info \
    RUST_BACKTRACE=1 \
    PORT=8080

EXPOSE 8080

CMD ["oxsig-ws-gateway"]
