FROM danifernandezs/skopeo:1.41.0-alpine3.10.3@sha256:3063f966f2752491ba2c3acb0e903a001c586e0fb5f404b8e8c3ac1f9e93c9f2

RUN apk add --no-cache wget
RUN cd /usr/local/bin && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.6.0/linux-amd64/docker-credential-ecr-login && \
  echo "af805202cb5d627dde2e6d4be1f519b195fd5a3a35ddc88d5010b4a4e5a98dd8  docker-credential-ecr-login" | sha256sum -c && \
  chmod +x docker-credential-ecr-login

RUN wget "https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v2.0.1/docker-credential-gcr_linux_amd64-2.0.1.tar.gz" && \
  echo "90837d1d9cf16809a60d5c7891d7d0b8445b1978ad43187032a0ca93bda49ed5  docker-credential-gcr_linux_amd64-2.0.1.tar.gz" | sha256sum -c && \
  tar xzf docker-credential-gcr_linux_amd64-2.0.1.tar.gz --to-stdout ./docker-credential-gcr \
  > /usr/local/bin/docker-credential-gcr && \
  chmod +x /usr/local/bin/docker-credential-gcr && \
  rm docker-credential-gcr_linux_amd64-2.0.1.tar.gz
