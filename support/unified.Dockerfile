#
# garden-base
#
FROM node:18-alpine3.17 as garden-alpine-base

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
ADD . /garden

WORKDIR /project

RUN chmod +x /garden/garden \
  && ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static \
  && GARDEN_DISABLE_ANALYTICS=true GARDEN_DISABLE_VERSION_CHECK=true garden util fetch-tools --all --garden-image-build

ENTRYPOINT ["/garden/garden"]

#
# garden-aws
#
FROM garden-alpine-base as garden-alpine-aws

RUN apk add --no-cache python3 py3-pip \
  && pip install awscli==1.22.77 --upgrade

RUN curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator \
  && chmod +x ./aws-iam-authenticator \
  && mv ./aws-iam-authenticator /usr/bin/

#
# gcloud base
#
FROM google/cloud-sdk:411.0.0-alpine as gcloud

RUN gcloud components install kubectl gke-gcloud-auth-plugin --quiet

#
# garden-gloud
#
FROM garden-alpine-base as garden-gcloud

ENV CLOUDSDK_PYTHON=python3

COPY --from=gcloud /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

RUN apk add --no-cache python3 py3-pip libc6-compat py3-openssl gnupg openssh-client py3-crcmod \
  && ln -s /google-cloud-sdk/bin/* /usr/local/bin/ \
  && chmod +x /usr/local/bin/* \
  && gcloud version

#
# garden-azure
#
FROM garden-alpine-base as garden-azure

# Build dependencies
RUN apk add --virtual=build gcc libffi-dev musl-dev openssl-dev make readline linux-pam \
  # Runtime dependency
  && apk add bash sudo shadow python3-dev py3-pip && pip3 install -U pip \
  # Actual azure cli
  && pip3 --no-cache-dir install azure-cli \
  # Remove build dependencies
  && apk del --purge build

RUN az aks install-cli # this will install the latest version of kubelogin if you need to pin to a specific version use --kubelogin-version v0.0.20

# Required by Azure DevOps to tell the system where node is installed
LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"

#
# garden-aws-gloud
#
FROM garden-gcloud as garden-aws-gcloud

RUN pip install awscli==1.22.77 --upgrade

RUN curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator \
  && chmod +x ./aws-iam-authenticator \
  && mv ./aws-iam-authenticator /usr/bin/


#
# garden-aws-gloud-azure
#
FROM garden-gcloud as garden-aws-gcloud-azure

ENV KUBELOGIN_VERSION=v0.0.24

RUN pip install awscli==1.22.77 --upgrade

RUN curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator \
  && chmod +x ./aws-iam-authenticator \
  && mv ./aws-iam-authenticator /usr/bin/

# Build dependencies
RUN apk add --virtual=build gcc libffi-dev musl-dev openssl-dev make py3-pip\
  # Runtime dependency
  && apk add python3-dev \
  && pip3 install virtualenv \
  && python3 -m virtualenv /azure-cli \
  && /azure-cli/bin/python -m pip --no-cache-dir install azure-cli \
  && echo "#!/usr/bin/env sh" > /usr/bin/az \
  && echo '/azure-cli/bin/python -m azure.cli "$@"' >> /usr/bin/az \
  && chmod +x /usr/bin/az \
  && wget https://github.com/Azure/kubelogin/releases/download/${KUBELOGIN_VERSION}/kubelogin-linux-amd64.zip \
  && unzip kubelogin-linux-amd64.zip \
  && cp bin/linux_amd64/kubelogin /usr/bin/
