FROM node:10.11.0-alpine

# The current implementation of Garden expects the Helm and OpenFaas binaries at these specific paths.

ARG HELM_PATH=/root/.garden/tools/helm/02a4751586d6a80f/
ARG FAASCLI_PATH=/root/.garden/tools/faas-cli/826489a1731741fd/

# system dependencies
RUN apk add --no-cache \
  bash \
  curl \
  docker \
  git \
  openssl \
  rsync \
  && mkdir -p ${HELM_PATH} \
  && curl -L https://storage.googleapis.com/kubernetes-helm/helm-v2.11.0-linux-amd64.tar.gz | tar xvz -C ${HELM_PATH}  \
  && chmod +x ${HELM_PATH}/linux-amd64/helm \
  && ${HELM_PATH}/linux-amd64/helm init --client-only \
  && mkdir -p ${FAASCLI_PATH}} \
  && curl -L -o ${FAASCLI_PATH}/faas-cli "https://github.com/openfaas/faas-cli/releases/download/0.7.3/faas-cli" \
  && chmod +x ${FAASCLI_PATH}/faas-cli \
  && curl -L -o /usr/local/bin/kubectl "https://storage.googleapis.com/kubernetes-release/release/v1.11.3/bin/linux/amd64/kubectl" \
  && chmod +x /usr/local/bin/kubectl

WORKDIR /garden

# npm dependencies
ADD scripts /garden/scripts
ADD vendor /garden/vendor
ADD package.json package-lock.json /garden/

# npm screws up the preinstall script, so we need to run it manually
RUN ./scripts/installVendorDeps.sh && \
  npm install --production --ignore-scripts && \
  npm cache clean --force

# garden code
ADD bin /garden/bin
ADD build /garden/build
ADD static /garden/static

WORKDIR /project

RUN ln -s /garden/static/bin/garden /bin/garden \
  && chmod +x /bin/garden
