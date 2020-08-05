ARG TAG=latest
FROM google/cloud-sdk:277.0.0-alpine as gcloud

RUN gcloud components install kubectl

FROM gardendev/garden:${TAG}

ENV CLOUDSDK_PYTHON=python3

COPY --from=gcloud /google-cloud-sdk /google-cloud-sdk

RUN apk add --no-cache python3 \
  && ln -s /google-cloud-sdk/bin/* /usr/local/bin/ \
  && chmod +x /usr/local/bin/*

RUN apk add --no-cache python py-pip \
  && pip install awscli==1.17.9 --upgrade \
  && apk del py-pip

RUN curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator \
  && chmod +x ./aws-iam-authenticator \
  && mv ./aws-iam-authenticator /usr/bin/  