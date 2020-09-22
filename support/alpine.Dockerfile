ARG NODE_VERSION=12.18.3-alpine3.11
FROM node:${NODE_VERSION}

RUN apk add --no-cache \
  bash \
  curl \
  docker-cli \
  git \
  openssl \
  rsync \
  ca-certificates \
  tar \
  gzip \
  libstdc++

# Note: This is run with the dist/alpine-amd64 directory as the context root
ADD . /garden

WORKDIR /project

ENV GARDEN_DISABLE_ANALYTICS=true
ENV GARDEN_DISABLE_VERSION_CHECK=true

RUN chmod +x /garden/garden \
  && ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static && garden util fetch-tools --all --garden-image-build --logger-type=basic

ENTRYPOINT ["/garden/garden"]
