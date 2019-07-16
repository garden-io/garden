FROM node:10.16.0-alpine

# system dependencies
RUN apk add --no-cache \
  bash \
  curl \
  docker \
  git \
  openssl \
  rsync \
  ca-certificates \
  tar \
  gzip

ADD dist/alpine-amd64/ /garden

WORKDIR /project

RUN ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden

ENTRYPOINT ["/garden/garden"]
