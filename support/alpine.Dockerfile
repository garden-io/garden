# Variant can be root or rootless.
# Defaults to root.
ARG VARIANT=root

# NOTE: This is not the node version Garden itself will run in. Garden binaries have node "built in" and the version installed on the system does not matter.
# The main reason we base these images off of the Node image is for Azure DevOps Support.
FROM node:25.5.0-alpine@sha256:f741690269ee7abb07675cb744f0b66ec117b482d89d9565a36f2360d5e2a3ef as garden-base-root

RUN apk add --no-cache \
  bash \
  curl \
  docker-cli \
  docker-cli-buildx \
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

# Add tools required for Azure DevOps. See also https://github.com/microsoft/azure-pipelines-agent/blob/master/docs/design/non-glibc-containers.md
RUN apk add --no-cache --virtual .pipeline-deps readline linux-pam  \
  && apk add bash sudo shadow \
  && apk del .pipeline-deps

ENV USER=root
ENV HOME=/root

# We do not set an entrypoint here for compatibility with Azure DevOps pipelines.
# See also https://learn.microsoft.com/en-us/azure/devops/pipelines/process/container-phases?view=azure-devops#linux-based-containers
ENTRYPOINT []

# Required by Azure DevOps to tell the system where node is installed
LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"

FROM garden-base-root as garden-base-rootless

ENV USER=gardenuser
ENV HOME=/home/gardenuser
RUN adduser -D $USER
USER $USER

FROM garden-base-$VARIANT as garden-base

# Note: This Dockerfile is run with dist/linux-amd64 as the context root
ADD --chown=$USER:root . /garden
ENV PATH /garden:$PATH
# Make sure we run garden once so that it extracts all the binaries already

WORKDIR $HOME
RUN GARDEN_DISABLE_ANALYTICS=true GARDEN_SEA_DEBUG=1 garden --help > /dev/null
RUN GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build

WORKDIR /project

FROM python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844 AS aws-builder

ENV AWSCLI_VERSION=2.28.11
ENV AWSCLI_SHA256="62a242e4bfae10f379615a9581d9e3526235fe1744afd9fddafd99d0e1c3d7d0"

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
FROM garden-base as garden-aws-base

COPY --chown=$USER:root --from=aws-builder /aws-cli /aws-cli
COPY --chown=$USER:root --from=aws-builder /usr/bin/aws-iam-authenticator /usr/bin/aws-iam-authenticator

#
# gcloud base
#
FROM google/cloud-sdk:545.0.0-alpine@sha256:69857eb8768d2eaa0d84b84098d54a590c5bc3080ccdb51034a3756c839762c2 as gcloud-base

RUN gcloud components install kubectl gke-gcloud-auth-plugin --quiet && gcloud components remove gsutil --quiet

# Clean up bloat that increases layer size unnecessarily
RUN rm -rf $(find /google-cloud-sdk/ -regex ".*/__pycache__") && rm -rf /google-cloud-sdk/.install/.backup

#
# garden-azure-base
#
FROM garden-base-root as garden-azure-base

WORKDIR /
ENV AZURE_CLI_VERSION=2.76.0

RUN wget -O requirements.txt https://raw.githubusercontent.com/Azure/azure-cli/azure-cli-${AZURE_CLI_VERSION}/src/azure-cli/requirements.py3.Linux.txt && \
  echo "ed8ae0cf68b9473da113279a0ecad6c1c1e1f34db29f161f821949d5205f19c8  requirements.txt" | sha256sum -c
RUN wget -O trim_sdk.py https://raw.githubusercontent.com/Azure/azure-cli/azure-cli-${AZURE_CLI_VERSION}/scripts/trim_sdk.py && \
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
FROM garden-base as garden-azure

COPY --chown=$USER:root --from=garden-azure-base /azure-cli /azure-cli
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/az /usr/local/bin/az
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubelogin /usr/local/bin/kubelogin

#
# garden-aws
#
FROM garden-base as garden-aws

# Copy aws cli
COPY --chown=$USER:root --from=garden-aws-base /aws-cli/lib/aws-cli /aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/bin/aws-iam-authenticator /usr/bin
ENV PATH /aws-cli:$PATH


#
# garden-gloud
#
FROM garden-base as garden-gcloud

ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=gcloud-base /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

#
# garden-aws-gloud
#
FROM garden-base as garden-aws-gcloud

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
FROM garden-base as garden-aws-gcloud-azure

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
