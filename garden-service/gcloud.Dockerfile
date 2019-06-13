ARG NAME
ARG TAG
FROM gardendev/garden-gcloud:${TAG}

RUN apk add --no-cache python \
  && mkdir -p /gcloud \
  && curl https://dl.google.com/dl/cloudsdk/release/google-cloud-sdk.tar.gz | tar xz -C /gcloud \
  && /gcloud/google-cloud-sdk/install.sh --quiet \
  && ln -s /gcloud/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud \
  && chmod +x /usr/local/bin/gcloud
