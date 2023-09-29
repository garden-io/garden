# Note: This is used by build-pkg.ts, and is not usable as a Garden container
FROM node:18.18.0-alpine@sha256:a0b787b0d53feacfa6d606fb555e0dbfebab30573277f1fe25148b05b66fa097 as builder

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
RUN npm install pkg@5.8.1 && \
  node_modules/.bin/pkg-fetch node18 alpine x64

# Add all the packages
ADD package.json /garden-tmp/package.json
ADD package-lock.json /garden-tmp/package-lock.json
ADD cli /garden-tmp/cli
ADD core /garden-tmp/core
ADD plugins /garden-tmp/plugins
ADD sdk /garden-tmp/sdk

# Install the CLI deps
WORKDIR /garden-tmp

RUN npm install --omit=dev && \
  # Fix for error in this particular package
  rm -rf node_modules/es-get-iterator/test

ADD static /garden/static

WORKDIR /garden-tmp/cli

# Create the binary
RUN mkdir -p /garden \
  && node_modules/.bin/pkg --compress Brotli --target node18-alpine-x64 . --output /garden/garden \
  && /garden/garden version
