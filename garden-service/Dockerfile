FROM node:10.11.0-alpine

# system dependencies
RUN apk add --no-cache \
  bash \
  curl \
  docker \
  git \
  openssl \
  rsync \
  && curl -L https://storage.googleapis.com/kubernetes-helm/helm-v2.11.0-linux-amd64.tar.gz | tar xvz --strip-components=1 -C /usr/local/bin linux-amd64/helm \
  && chmod +x /usr/local/bin/helm \
  && helm init --client-only \
  && curl -L -o /usr/local/bin/faas-cli "https://github.com/openfaas/faas-cli/releases/download/0.7.3/faas-cli" \
  && chmod +x /usr/local/bin/faas-cli \
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
ENTRYPOINT [ "garden" ]

RUN ln -s /garden/static/bin/garden /bin/garden \
  && chmod +x /bin/garden
