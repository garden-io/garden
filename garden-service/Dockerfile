FROM node:12.13.1-alpine

# system dependencies
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

VOLUME ["~/.pkg-cache"]

ADD bin /tmp/bin
ADD build /tmp/build
ADD package.json /tmp/

# build binary (need to do this in-container for alpine due to a bug in zeit/pkg)
RUN cd /tmp \
  && npm install \
  && node_modules/.bin/pkg --target node12-alpine-x64 . \
  && mkdir -p /garden \
  && mv garden-service /garden/garden \
  && rm -rf node_modules \
    /root/.npm/* \
    /usr/lib/node_modules/npm/man/* \
    /usr/lib/node_modules/npm/doc/* \
    /usr/lib/node_modules/npm/html/* \
    /usr/lib/node_modules/npm/scripts/*

ADD static /garden/static

WORKDIR /project

RUN ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden

ENTRYPOINT ["/garden/garden"]
