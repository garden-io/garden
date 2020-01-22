FROM node:12.13.1-buster

# system dependencies
RUN set -ex; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
  bash \
  docker \
  git \
  gzip \
  openssl \
  rsync; \
  rm -rf /var/lib/apt/lists/*

ADD . /garden

WORKDIR /project

RUN ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden

ENTRYPOINT ["/garden/garden"]
