ARG TAG=latest
FROM gardendev/garden:${TAG}
ENV KUBELOGIN_VERSION="v0.0.9"

# Build dependencies
RUN apk add --virtual=build gcc libffi-dev musl-dev openssl-dev make \
# Runtime dependency
  && apk add  python3-dev && pip3 install -U pip \
# Actual azure cli
  && pip3 --no-cache-dir install azure-cli \
# Remove build dependencies
  && apk del --purge build

# Azure DevOps Pipeline Dependencies
RUN apk add --no-cache --virtual .pipeline-deps readline linux-pam  \
  && apk add bash sudo shadow \
  && apk del .pipeline-deps

# Ensure kubelogin is available
RUN wget -O kubelogin-linux-amd64.zip https://github.com/Azure/kubelogin/releases/download/$KUBELOGIN_VERSION/kubelogin-linux-amd64.zip  \
 && unzip kubelogin-linux-amd64.zip \
 && cp bin/linux_amd64/kubelogin /usr/local/bin/ \
 && rm kubelogin-linux-amd64.zip


LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"

ENTRYPOINT []

