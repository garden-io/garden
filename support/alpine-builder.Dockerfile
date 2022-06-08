# Note: This is used by build-pkg.ts, and is not usable as a Garden container
ARG NODE_VERSION=14.19.0-alpine3.14
FROM node:${NODE_VERSION} as builder

RUN apk add --no-cache \
  ca-certificates \
  git \
  gzip \
  libstdc++ \
  openssh \
  openssl \
  python3 \
  make \
  gcc \
  g++ \
  musl-dev \
  tar

WORKDIR /garden-tmp/pkg

# Pre-fetch the node binary for pkg
RUN yarn add pkg@5.7.0 && \
  node_modules/.bin/pkg-fetch node14 alpine x64

# Add all the packages
ADD cli /garden-tmp/cli
ADD core /garden-tmp/core
ADD plugins /garden-tmp/plugins
ADD sdk /garden-tmp/sdk

# Install the CLI deps
WORKDIR /garden-tmp/cli

RUN yarn && \
  # Fix for error in this particular package
  rm -rf node_modules/es-get-iterator/test

ADD static /garden/static

# Create the binary
RUN mkdir -p /garden \
  && node_modules/.bin/pkg --target node14-alpine-x64 . --output /garden/garden \
  && cp node_modules/better-sqlite3/build/Release/better_sqlite3.node /garden \
  && /garden/garden version
