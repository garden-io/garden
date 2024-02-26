FROM danifernandezs/skopeo:1.41.0-alpine3.10.3@sha256:3063f966f2752491ba2c3acb0e903a001c586e0fb5f404b8e8c3ac1f9e93c9f2

RUN apk add --no-cache wget
RUN cd /usr/local/bin && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.6.0/linux-amd64/docker-credential-ecr-login && \
  echo "af805202cb5d627dde2e6d4be1f519b195fd5a3a35ddc88d5010b4a4e5a98dd8  docker-credential-ecr-login" | sha256sum -c && \
  chmod +x docker-credential-ecr-login

RUN cd /usr/local/bin && \
  wget "https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v2.1.14/docker-credential-gcr_linux_amd64-2.1.14.tar.gz" && \
  echo "81f2d215466ab5bf6a350aadab42b42ad29590d16eab39f28014e4a6563c848a  docker-credential-gcr_linux_amd64-2.1.14.tar.gz" | sha256sum -c && \
  tar xzf docker-credential-gcr_linux_amd64-2.1.14.tar.gz && \
  rm docker-credential-gcr_linux_amd64-2.1.14.tar.gz && \
  chmod +x docker-credential-gcr
