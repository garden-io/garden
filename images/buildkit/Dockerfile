FROM moby/buildkit:v0.10.5@sha256:ca9d86324a000a0cc6d93ae9d0d5a9df750a194d0d43644c3a71fc6230ceba44 as buildkit

RUN apk add --no-cache wget

# ECR credential helper
RUN cd /usr/local/bin && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.6.0/linux-amd64/docker-credential-ecr-login && \
  echo "af805202cb5d627dde2e6d4be1f519b195fd5a3a35ddc88d5010b4a4e5a98dd8  docker-credential-ecr-login" | sha256sum -c && \
  chmod +x docker-credential-ecr-login

# GCR credential helper
RUN wget "https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v2.0.1/docker-credential-gcr_linux_amd64-2.0.1.tar.gz" && \
  echo "90837d1d9cf16809a60d5c7891d7d0b8445b1978ad43187032a0ca93bda49ed5  docker-credential-gcr_linux_amd64-2.0.1.tar.gz" | sha256sum -c && \
  tar xzf docker-credential-gcr_linux_amd64-2.0.1.tar.gz --to-stdout ./docker-credential-gcr \
  > /usr/local/bin/docker-credential-gcr && \
  chmod +x /usr/local/bin/docker-credential-gcr && \
  rm docker-credential-gcr_linux_amd64-2.0.1.tar.gz

FROM moby/buildkit:v0.10.5-rootless@sha256:3a5eca9b8d5d0e6cdcd0e756d607bf7386cd1b61950daf63afadee79b43ba8bf as buildkit-rootless

COPY --from=buildkit /usr/local/bin/docker-credential-ecr-login /usr/local/bin/docker-credential-ecr-login
COPY --from=buildkit /usr/local/bin/docker-credential-gcr /usr/local/bin/docker-credential-gcr
