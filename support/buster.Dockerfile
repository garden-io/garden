# Variant can be root or rootless.
# Defaults to root.
ARG VARIANT=root

FROM node:18-buster-slim@sha256:9abd80cc15505e4c1a2858add71468402882c29752cae56a434ddeed7d06bd77 as buster-base-root

# system dependencies
RUN set -ex; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
  apt-transport-https \
  bash \
  ca-certificates \
  curl \
  gnupg2 \
  git \
  gzip \
  openssl \
  rsync \
  software-properties-common; \
  \
  curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -; \
  add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable"; \
  apt-get update; \
  apt-get install -y docker-ce-cli; \
  rm -rf /var/lib/apt/lists/*;

ENV USER=root
ENV HOME=/root

ENTRYPOINT ["/garden/garden"]

FROM buster-base-root as buster-base-rootless

ENV USER=gardenuser
ENV HOME=/home/gardenuser
RUN useradd -ms /bin/bash $USER

USER $USER

FROM buster-base-$VARIANT as buster-base

# Note: This Dockerfile is run with dist/linux-amd64 as the context root
ADD --chown=$USER:root . /garden
ENV PATH /garden:$PATH
RUN cd /garden/static && git init

WORKDIR $HOME
RUN GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build

WORKDIR /project
