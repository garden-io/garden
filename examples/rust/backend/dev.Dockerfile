# Based on https://github.com/LukeMathWalker/cargo-chef
FROM lukemathwalker/cargo-chef:latest-rust-1.70.0 AS chef
WORKDIR /app
# Install `cargo-watch` from binaries
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
RUN export PATH=$PATH:~/.cargo/bin
RUN cargo binstall -y cargo-watch

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies - this is the caching Docker layer!
RUN cargo chef cook --recipe-path recipe.json
# Build application
COPY . .
RUN cargo build
# Use cargo watch for hot reloading
CMD [ "sh", "-c", "cargo watch -x run" ]
