FROM node:18.15.0-alpine@sha256:19eaf41f3b8c2ac2f609ac8103f9246a6a6d46716cdbe49103fdb116e55ff0cc

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
  openssh-client \
  libstdc++

# Note: This is run with the dist/alpine-amd64 directory as the context root
ADD . /garden

WORKDIR /project

RUN chmod +x /garden/garden \
  && ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static \
  && GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build --logger-type=basic

ENTRYPOINT ["/garden/garden"]
