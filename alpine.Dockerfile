ARG NODE_VERSION=12.16.1-alpine3.11
FROM node:${NODE_VERSION} as builder

RUN apk add --no-cache \
  ca-certificates \
  git \
  gzip \
  libstdc++ \
  openssh \
  openssl \
  tar

WORKDIR /tmp

RUN npm install pkg@4.4.8 && node_modules/.bin/pkg-fetch node12 alpine x64

ADD core/package.json /tmp/
ADD core/package-lock.json /tmp/

RUN npm install \
  && rm -rf /root/.npm/* \
  /usr/lib/node_modules/npm/man/* \
  /usr/lib/node_modules/npm/doc/* \
  /usr/lib/node_modules/npm/html/* \
  /usr/lib/node_modules/npm/scripts/*

ADD core/bin/garden /tmp/bin/garden
ADD core/bin/garden-debug /tmp/bin/garden-debug
ADD core/build /tmp/build

RUN node_modules/.bin/pkg --target node12-alpine-x64 . \
  && mkdir -p /garden \
  && mv core /garden/garden \
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

ADD core/static /garden/static
# Need to make the static directory a git root, and replace the symlinked dashboard directory with the full build
RUN cd /garden/static && git init && rm -rf /garden/static/dashboard
ADD dashboard/build /garden/static/dashboard

WORKDIR /project

RUN chmod +x /garden/garden \
  && ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static && garden util fetch-tools --all --garden-image-build --logger-type=basic

ENTRYPOINT ["/garden/garden"]
