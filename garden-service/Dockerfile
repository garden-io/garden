FROM node:10.15.3-alpine

# system dependencies
RUN apk add --no-cache \
  bash \
  curl \
  docker \
  git \
  openssl \
  rsync \
  ca-certificates \
  tar \
  gzip

WORKDIR /garden

# npm dependencies
ADD package.json package-lock.json /garden/

RUN npm install --production && npm cache clean --force

# garden code
ADD bin /garden/bin
ADD build /garden/build
ADD static /garden/static

WORKDIR /project

RUN ln -s /garden/bin/garden /bin/garden \
  && chmod +x /bin/garden

ENTRYPOINT ["/garden/bin/garden"]
