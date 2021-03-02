ARG TAG=latest
FROM gardendev/garden:${TAG}

# Build dependencies
RUN apk add --virtual=build gcc libffi-dev musl-dev openssl-dev make \
# Runtime dependency
  && apk add python3-dev && pip3 install -U pip \
# Actual azure cli
  && pip3 --no-cache-dir install azure-cli \
# Remove build dependencies
  && apk del --purge build
