ARG NODE_VERSION=12.13.1-alpine
FROM node:${NODE_VERSION} as builder

RUN apk add --no-cache \
  ca-certificates \
  git \
  gzip \
  libstdc++ \
  openssl \
  tar

WORKDIR /tmp

RUN npm install pkg@4.4.2 && node_modules/.bin/pkg-fetch node12 alpine x64

ADD package.json /tmp/
ADD package-lock.json /tmp/

RUN npm install \
  && rm -rf /root/.npm/* \
    /usr/lib/node_modules/npm/man/* \
    /usr/lib/node_modules/npm/doc/* \
    /usr/lib/node_modules/npm/html/* \
    /usr/lib/node_modules/npm/scripts/*

ADD bin/garden /tmp/bin/garden
ADD bin/garden-debug /tmp/bin/garden-debug
ADD build /tmp/build

RUN node_modules/.bin/pkg --target node12-alpine-x64 . \
  && mkdir -p /garden \
  && mv garden-service /garden/garden \
  && cp node_modules/sqlite3/lib/binding/node-v72-linux-x64/node_sqlite3.node /garden

#### Main container ####
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

COPY --from=builder /garden /garden

ADD static /garden/static
RUN cd /garden/static && git init

WORKDIR /project

RUN chmod +x /garden/garden \
  && ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden

ENTRYPOINT ["/garden/garden"]
