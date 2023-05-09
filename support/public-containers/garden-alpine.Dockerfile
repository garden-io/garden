###
### Plain Garden, without tools
###
FROM node:18.15.0-alpine@sha256:19eaf41f3b8c2ac2f609ac8103f9246a6a6d46716cdbe49103fdb116e55ff0cc as garden-alpine-plain

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
  libstdc++

# Note: This is run with the dist/alpine-amd64 directory as the context root
ADD ./garden /garden
ADD ./installers/alpine /cloud_installers/

WORKDIR /project

RUN chmod +x /garden/garden \
  && ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static \
  && GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build --logger-type=basic

ENTRYPOINT ["/garden/garden"]

###
### Garden & Google Cloud
###

# fetch tools
FROM google/cloud-sdk:423.0.0-alpine@sha256:0bbd9c0bef31f7ad8802e21258e590e3df988b755af9f03cc7ba613cfbd8bb4e as tools-gcloud
RUN gcloud components install kubectl gke-gcloud-auth-plugin --quiet

# Combine plain garden alpine image with gcloud tools
FROM garden-alpine-plain as garden-alpine-gcloud
ENV CLOUDSDK_PYTHON=python3
COPY --from=gcloud /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH
RUN apk add --no-cache python3 py3-pip libc6-compat py3-openssl gnupg openssh-client py3-crcmod \
  && ln -s /google-cloud-sdk/bin/* /usr/local/bin/ \
  && chmod +x /usr/local/bin/* \
  && gcloud version

###
### Garden & Azure
###
FROM garden-alpine-plain as garden-alpine-azure
RUN /cloud_installers/azure.sh
# Required by Azure DevOps to tell the system where node is installed
LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"

###
### Garden & Amazon Web Services
###
FROM garden-alpine-plain as garden-alpine-aws
RUN /cloud_installers/aws.sh

###
### Garden & Google Cloud & Amazon Web Services
###
FROM garden-alpine-gcloud as garden-alpine-gcloud-aws
RUN /cloud_installers/aws.sh

###
### Garden & Google Cloud & Amazon Web Services
###
FROM garden-alpine-gcloud as garden-alpine-full
RUN /cloud_installers/aws.sh
RUN /cloud_installers/azure.sh
RUN /cloud_installers/ibmcloud.sh
