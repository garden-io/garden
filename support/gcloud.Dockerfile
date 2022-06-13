ARG TAG=latest
FROM google/cloud-sdk:331.0.0-alpine as gcloud

RUN gcloud components install kubectl --quiet

FROM gardendev/garden:${TAG}

ENV CLOUDSDK_PYTHON=python3

COPY --from=gcloud /google-cloud-sdk /google-cloud-sdk
ENV PATH /google-cloud-sdk/bin:$PATH

RUN apk add --no-cache python3 py3-pip libc6-compat py3-openssl gnupg openssh-client py3-crcmod \
  && ln -s /google-cloud-sdk/bin/* /usr/local/bin/ \
  && chmod +x /usr/local/bin/* \
  && gcloud version
