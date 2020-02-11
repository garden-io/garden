ARG TAG=latest
FROM gardendev/garden:${TAG}

RUN apk add --no-cache python py-pip \
  && pip install awscli==1.17.9 --upgrade \
  && apk del py-pip
