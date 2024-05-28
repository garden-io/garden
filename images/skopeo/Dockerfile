FROM danifernandezs/skopeo:1.41.0-alpine3.10.3@sha256:3063f966f2752491ba2c3acb0e903a001c586e0fb5f404b8e8c3ac1f9e93c9f2

RUN apk add --no-cache wget
ARG TARGETARCH
# ECR credential helper
RUN cd /usr/local/bin && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.8.0/linux-$TARGETARCH/docker-credential-ecr-login && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "dcc7ae9915b5d8fa2d9e2b18fc30bab5bfbbce5b82401c7644e6ab97973ac35c  docker-credential-ecr-login" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "d62badea3153688ec5c24f440df9fb84ff4b02c624dff9288967267e7445daa1  docker-credential-ecr-login" | sha256sum -c; \
  fi && \
  chmod +x docker-credential-ecr-login

ARG TARGETARCH
# GCR credential helper
RUN cd /usr/local/bin && \
  GCR_HELPER_VERSION="2.1.22" && \
  wget https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v${GCR_HELPER_VERSION}/docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "443e897dc383d69e55e6dbcb13802f4ec88444848612e83f0381df2ddd721694  docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "b607dfb7516dc1ca6a2a05322d938cea58cc5975e2063efc3695ee6ddb2dccc7  docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz" | sha256sum -c; \
  fi && \
  tar xzf docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz && \
  rm docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz && \
  chmod +x docker-credential-gcr
