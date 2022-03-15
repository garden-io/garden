ARG TAG=latest
FROM gardendev/garden-gcloud:${TAG}

RUN pip install awscli==1.22.77 --upgrade

RUN curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator \
  && chmod +x ./aws-iam-authenticator \
  && mv ./aws-iam-authenticator /usr/bin/