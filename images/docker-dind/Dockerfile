FROM docker:19.03.7-dind

RUN apk add --no-cache curl
RUN cd /usr/local/bin && \
  curl -O https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.4.0/linux-amd64/docker-credential-ecr-login && \
  chmod +x docker-credential-ecr-login
