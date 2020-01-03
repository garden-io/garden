ARG NAME
ARG TAG
FROM gardendev/garden:${TAG}

RUN apk add bash py-pip \
  && apk add --virtual=build gcc libffi-dev musl-dev openssl-dev python-dev make \
  && pip --no-cache-dir install -U pip \
  && pip --no-cache-dir install azure-cli \
  && apk del --purge build

COPY --from=lachlanevenson/k8s-kubectl:latest /usr/local/bin/kubectl /usr/local/bin/kubectl

