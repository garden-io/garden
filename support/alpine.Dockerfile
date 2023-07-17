# Variant can be root or rootless.
# Defaults to root.
ARG VARIANT=root

#
# garden-base
#
FROM node:18.15.0-alpine@sha256:a3f2350bd3eb48525f801b57934300c11aa3610086b708854ab1c1045c018519 as garden-alpine-base-root

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
  libstdc++ \
  python3 \
  py3-pip \
  libc6-compat \
  py3-openssl \
  libffi \
  gnupg \
  groff \
  py3-crcmod

ENV USER=root
ENV HOME=/root

ENTRYPOINT ["/garden/garden"]

FROM garden-alpine-base-root as garden-alpine-base-rootless

ENV USER=gardenuser
ENV HOME=/home/gardenuser
RUN adduser -D $USER
USER $USER

FROM garden-alpine-base-$VARIANT as garden-alpine-base

# Note: This Dockerfile is run with dist/linux-amd64 as the context root
ADD --chown=$USER:root . /garden
ENV PATH /garden:$PATH
RUN cd /garden/static && git init

WORKDIR $HOME
RUN GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build

WORKDIR /project

FROM python:3.11-alpine@sha256:4e8e9a59bf1b3ca8e030244bc5f801f23e41e37971907371da21191312087a07 AS aws-builder

ENV AWSCLI_VERSION=2.11.18
ENV AWSCLI_SHA256="b09bee1a52a1dc8c3f5e904195933fd27583f867276dd0deefc53358b9074b9d"

RUN apk add --no-cache \
  wget \
  make \
  cmake \
  gcc \
  g++ \
  libc-dev \
  libffi-dev \
  openssl-dev
RUN wget https://awscli.amazonaws.com/awscli-$AWSCLI_VERSION.tar.gz && \
  echo "$AWSCLI_SHA256  awscli-$AWSCLI_VERSION.tar.gz" | sha256sum -c && \
  tar -xzf awscli-$AWSCLI_VERSION.tar.gz
RUN cd awscli-$AWSCLI_VERSION \
  && ./configure --bindir=/usr/local/bin --prefix=/aws-cli/ --with-download-deps --with-install-type=portable-exe \
  && make \
  && make install
RUN wget -O aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator && \
  echo "fe958eff955bea1499015b45dc53392a33f737630efd841cd574559cc0f41800  aws-iam-authenticator" | sha256sum -c && \
  chmod +x ./aws-iam-authenticator && \
  mv ./aws-iam-authenticator /usr/bin/

#
# garden-aws-base
#
FROM garden-alpine-base as garden-aws-base

COPY --chown=$USER:root --from=aws-builder /aws-cli /aws-cli
COPY --chown=$USER:root --from=aws-builder /usr/bin/aws-iam-authenticator /usr/bin/aws-iam-authenticator

#
# gcloud base
#
FROM google/cloud-sdk:438.0.0-alpine@sha256:429745a61f5928d0149a1dffa50731104798116ac3db3bc7a88d59a78d0e4509 as gcloud-base

RUN gcloud components install kubectl gke-gcloud-auth-plugin --quiet

# Clean up bloat that increases layer size unnecessarily
RUN rm -rf $(find /google-cloud-sdk/ -regex ".*/__pycache__") && rm -rf /google-cloud-sdk/.install/.backup

#
# garden-azure-base
#
FROM garden-alpine-base-root as garden-azure-base

WORKDIR /
ENV AZURE_CLI_VERSION=2.48.1

RUN wget -O requirements.txt https://raw.githubusercontent.com/Azure/azure-cli/azure-cli-$AZURE_CLI_VERSION/src/azure-cli/requirements.py3.Linux.txt && \
  echo "c552be7337282c28b28cded6bd8d4b64247ddd2c4faf59042555fcc478405afb  requirements.txt" | sha256sum -c
RUN wget -O trim_sdk.py https://raw.githubusercontent.com/Azure/azure-cli/azure-cli-$AZURE_CLI_VERSION/scripts/trim_sdk.py && \
  echo "2e6292f5285b4fcedbe8efd77309fade550667d1c502a6ffa078f1aa97942c64  trim_sdk.py" | sha256sum -c

RUN apk add py3-virtualenv openssl-dev libffi-dev build-base python3-dev
RUN python3 -m virtualenv /azure-cli
ENV PATH /azure-cli/bin:$PATH

RUN pip install -r requirements.txt && python trim_sdk.py

RUN ln -s /azure-cli/bin/az /usr/local/bin/az
RUN az aks install-cli

#
# garden-azure
#
FROM garden-alpine-base as garden-azure

COPY --chown=$USER:root --from=garden-azure-base /azure-cli /azure-cli
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/az /usr/local/bin/az
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubelogin /usr/local/bin/kubelogin

# Required by Azure DevOps to tell the system where node is installed
LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"

#
# garden-aws
#
FROM garden-alpine-base as garden-aws

# Copy aws cli
COPY --chown=$USER:root --from=garden-aws-base /aws-cli/lib/aws-cli /aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/bin/aws-iam-authenticator /usr/bin
ENV PATH /aws-cli:$PATH


#
# garden-gloud
#
FROM garden-alpine-base as garden-gcloud

ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=gcloud-base /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

#
# garden-aws-gloud
#
FROM garden-alpine-base as garden-aws-gcloud

# Copy aws cli
COPY --chown=$USER:root --from=garden-aws-base /aws-cli/lib/aws-cli /aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/bin/aws-iam-authenticator /usr/bin
ENV PATH /aws-cli:$PATH

ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=gcloud-base /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH


#
# garden-aws-gloud-azure
#
FROM garden-alpine-base as garden-aws-gcloud-azure

# Copy aws cli
COPY --chown=$USER:root --from=garden-aws-base /aws-cli/lib/aws-cli /aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/bin/aws-iam-authenticator /usr/bin
ENV PATH /aws-cli:$PATH

ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=gcloud-base /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

COPY --chown=$USER:root --from=garden-azure-base /azure-cli /azure-cli
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/az /usr/local/bin/az
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubelogin /usr/local/bin/kubelogin

# Required by Azure DevOps to tell the system where node is installed
LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"
