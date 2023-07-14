# Variant can be root or rootless.
# Defaults to root.
ARG VARIANT=root

FROM node:18.15.0-buster-slim@sha256:b89966598ea8c38c37543823e54f3ff36c067d90f935085796cbd077a98c4ff8 as buster-base-root

# system dependencies
RUN apt-get update && \
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
    software-properties-common && \
  install -m 0755 -d /etc/apt/keyrings && \
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
  chmod a+r /etc/apt/keyrings/docker.gpg && \
  echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" > /etc/apt/sources.list.d/docker.list && \
  apt-get update && \
  apt-get install docker-ce-cli -y

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
