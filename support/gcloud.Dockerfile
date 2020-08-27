ARG TAG=latest
FROM google/cloud-sdk:277.0.0-alpine as gcloud

RUN gcloud components install kubectl

FROM gardendev/garden:${TAG}

ENV CLOUDSDK_PYTHON=python3

COPY --from=gcloud /google-cloud-sdk /google-cloud-sdk

RUN apk add --no-cache python3 \
  && ln -s /google-cloud-sdk/bin/* /usr/local/bin/ \
  && chmod +x /usr/local/bin/*
