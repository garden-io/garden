# Variant can be root or rootless.
# Defaults to root.
ARG VARIANT=root

FROM node:18-buster@sha256:9b982ad25de81f86da9c47fd057e15f980036343ad45e602ead9926eea0d64ff as buster-base-root

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

# Note: This Dockerfile is run with dist/linux-amd64 as the context root
ADD . /garden

WORKDIR /project

RUN ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static \
  && git init

ENTRYPOINT ["/garden/garden"]

FROM buster-base-root as buster-base-rootless

ENV USER=gardenuser
ENV HOME=/home/gardenuser
RUN useradd -ms /bin/bash $USER
USER $USER
WORKDIR $HOME

FROM buster-base-$VARIANT as buster-base

RUN GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build
