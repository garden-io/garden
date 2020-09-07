# Note: This is used by build-pkg.ts, and is not usable as a Garden container
ARG NODE_VERSION=12.18.3-alpine3.11
FROM node:${NODE_VERSION} as builder

RUN apk add --no-cache \
  ca-certificates \
  git \
  gzip \
  libstdc++ \
  openssh \
  openssl \
  tar

WORKDIR /tmp/pkg

# Pre-fetch the node12 binary for pkg
RUN yarn add pkg@4.4.9 && \
  node_modules/.bin/pkg-fetch node12 alpine x64

# Add all the packages
ADD cli /tmp/cli
ADD core /tmp/core
ADD plugins /tmp/plugins
ADD sdk /tmp/sdk

# Install the CLI deps
WORKDIR /tmp/cli

RUN apk add --no-cache python make gcc g++ --virtual .build-deps && \
  yarn --production && \
  # Fix for error in this particular package
  rm -rf node_modules/es-get-iterator/test && \
  apk del .build-deps

ADD static /garden/static

# Create the binary
RUN mkdir -p /garden \
  && ../pkg/node_modules/.bin/pkg --target node12-alpine-x64 . --output /garden/garden \
  && cp node_modules/better-sqlite3/build/Release/better_sqlite3.node /garden \
  && /garden/garden version
