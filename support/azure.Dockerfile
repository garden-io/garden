ARG TAG=latest
FROM gardendev/garden:${TAG}

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
