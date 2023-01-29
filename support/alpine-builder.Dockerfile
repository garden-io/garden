# Note: This is used by build-pkg.ts, and is not usable as a Garden container
ARG NODE_VERSION=18-alpine3.17
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
  node_modules/.bin/pkg-fetch node18 alpine x64

# Add all the packages
ADD cli /garden-tmp/cli
ADD core /garden-tmp/core
ADD plugins /garden-tmp/plugins
ADD sdk /garden-tmp/sdk

# Install the CLI deps
WORKDIR /garden-tmp/cli

# Need multiple attempts unfortunately, the old yarn version doesn't handle network issues quite gracefully
RUN for i in 1 2 3 4 5; do yarn --production && break || sleep 5; done && \
  # Fix for error in this particular package
  rm -rf node_modules/es-get-iterator/test

ADD static /garden/static

# Create the binary
RUN mkdir -p /garden \
  && node_modules/.bin/pkg --compress Brotli --target node18-alpine-x64 . --output /garden/garden \
  && /garden/garden version
