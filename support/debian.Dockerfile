# Variant can be root or rootless.
# Defaults to root.
ARG VARIANT=root

# NOTE: This is not the node version Garden itself will run in. Garden binaries have node "built in" and the version installed on the system does not matter.
# The main reason we base these images off of the Node image is for Azure DevOps Support.
FROM node:23.3.0-bookworm-slim@sha256:a612c124cf719af9f037f0b9c40dd0511b8fe23d4fc330202c6a6462f2afb8ef as garden-bookworm-base-root

FROM garden-bookworm-base-root as garden-base-root
# system dependencies
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
    apt-transport-https \
    bash \
    ca-certificates \
    curl \
    gnupg2 \
    git \
    unzip \
    openssl \
    rsync \
    wget \
    mandoc \
    python3 \
    libffi-dev \
    openssl \
    software-properties-common && \
  install -m 0755 -d /etc/apt/keyrings && \
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
  chmod a+r /etc/apt/keyrings/docker.gpg && \
  echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" > /etc/apt/sources.list.d/docker.list && \
  apt-get update && \
  apt-get install docker-ce-cli docker-buildx-plugin -y

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
RUN useradd -ms /bin/bash $USER
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

#
# garden-aws-base
#
FROM garden-base-root as garden-aws-base
ENV AWSCLI_VERSION=2.22.0
ENV AWSCLI_SHA256="f315aa564190a12ae05a05bd8ab7b0645dd4a1ad71ce9e47dae4ff3dfeee8ceb"

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${AWSCLI_VERSION}.zip" -o "awscliv2.zip"
RUN echo "${AWSCLI_SHA256}  awscliv2.zip" | sha256sum -c
RUN unzip awscliv2.zip
RUN ./aws/install

#
# garden-gcloud-base
#
FROM garden-base as garden-gcloud-base
ENV GCLOUD_VERSION=501.0.0
ENV GCLOUD_SHA256="b65ef3d0018bf213ba1da7a8f864fa9a1e413c740475ab0c8621935bd06a34e2"

RUN curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-${GCLOUD_VERSION}-linux-x86_64.tar.gz
RUN echo "${GCLOUD_SHA256}  google-cloud-cli-${GCLOUD_VERSION}-linux-x86_64.tar.gz" | sha256sum -c
RUN tar -xf google-cloud-cli-${GCLOUD_VERSION}-linux-x86_64.tar.gz
RUN ./google-cloud-sdk/install.sh --quiet
RUN ./google-cloud-sdk/bin/gcloud components install kubectl gke-gcloud-auth-plugin --quiet && ./google-cloud-sdk/bin/gcloud components remove gsutil --quiet

#
# garden-azure-base
#
FROM garden-base-root as garden-azure-base
ENV AZURE_CLI_VERSION=2.67.0

RUN apt-get update
RUN apt-get install ca-certificates curl apt-transport-https lsb-release gnupg
RUN mkdir -p /etc/apt/keyrings
RUN curl -sLS https://packages.microsoft.com/keys/microsoft.asc | \
    gpg --dearmor | tee /etc/apt/keyrings/microsoft.gpg > /dev/null
RUN chmod go+r /etc/apt/keyrings/microsoft.gpg
RUN echo "deb [arch=`dpkg --print-architecture` signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" | \
    tee /etc/apt/sources.list.d/azure-cli.list
RUN apt-get update
RUN apt-get install azure-cli=${AZURE_CLI_VERSION}-1~bookworm
RUN az aks install-cli

#
# garden-azure
#
FROM garden-base as garden-azure

# Copy azure cli
COPY --chown=$USER:root --from=garden-azure-base /usr/bin/az /usr/bin/az
COPY --chown=$USER:root --from=garden-azure-base /opt/az /opt/az
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubelogin /usr/local/bin/kubelogin

#
# garden-aws
#
FROM garden-base as garden-aws
ENV AWSCLI_VERSION=2.22.0
# Copy aws cli
RUN mkdir -p ${HOME}/aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/local/aws-cli ${HOME}/aws-cli
ENV PATH ${HOME}/aws-cli/v2/${AWSCLI_VERSION}/bin:$PATH

#
# garden-gloud
#
FROM garden-base as garden-gcloud

# Copy gcloud cli
ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=garden-gcloud-base /project/google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

#
# garden-aws-gloud
#
FROM garden-base as garden-aws-gcloud
ENV AWSCLI_VERSION=2.22.0

# Copy aws cli
RUN mkdir -p ${HOME}/aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/local/aws-cli ${HOME}/aws-cli
ENV PATH ${HOME}/aws-cli/v2/${AWSCLI_VERSION}/bin:$PATH

# Copy gcloud cli
ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=garden-gcloud-base /project/google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

#
# garden-aws-gloud-azure
#
FROM garden-base as garden-aws-gcloud-azure
ENV AWSCLI_VERSION=2.22.0

# Copy aws cli
RUN mkdir -p ${HOME}/aws-cli
COPY --chown=$USER:root --from=garden-aws-base /usr/local/aws-cli ${HOME}/aws-cli
ENV PATH ${HOME}/aws-cli/v2/${AWSCLI_VERSION}/bin:$PATH

# Copy gcloud cli
ENV CLOUDSDK_PYTHON=python3

COPY --chown=$USER:root --from=garden-gcloud-base /project/google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

# Copy azure cli
COPY --chown=$USER:root --from=garden-azure-base /usr/bin/az /usr/bin/az
COPY --chown=$USER:root --from=garden-azure-base /opt/az /opt/az
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --chown=$USER:root --from=garden-azure-base /usr/local/bin/kubelogin /usr/local/bin/kubelogin
