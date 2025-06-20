FROM moby/buildkit:v0.23.1@sha256:dbc2dfd9342fd5c891ea94e9774c15cab985681e5ff995a9e366066aa0b9b2b4 as buildkit

RUN apk add --no-cache wget

ARG TARGETARCH
# ECR credential helper
RUN cd /usr/local/bin && \
  ECR_HELPER_VERSION="0.8.0" && \
  ECR_HELPER_DISTR_NAME="docker-credential-ecr-login" && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/${ECR_HELPER_VERSION}/linux-$TARGETARCH/${ECR_HELPER_DISTR_NAME} && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "dcc7ae9915b5d8fa2d9e2b18fc30bab5bfbbce5b82401c7644e6ab97973ac35c  ${ECR_HELPER_DISTR_NAME}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "d62badea3153688ec5c24f440df9fb84ff4b02c624dff9288967267e7445daa1  ${ECR_HELPER_DISTR_NAME}" | sha256sum -c; \
  fi && \
  chmod +x ${ECR_HELPER_DISTR_NAME}

ARG TARGETARCH
# GCR credential helper
RUN cd /usr/local/bin && \
  GCR_HELPER_VERSION="2.1.22" && \
  GCR_HELPER_DISTR_NAME="docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz" && \
  wget https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v${GCR_HELPER_VERSION}/${GCR_HELPER_DISTR_NAME} && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "443e897dc383d69e55e6dbcb13802f4ec88444848612e83f0381df2ddd721694  ${GCR_HELPER_DISTR_NAME}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "b607dfb7516dc1ca6a2a05322d938cea58cc5975e2063efc3695ee6ddb2dccc7  ${GCR_HELPER_DISTR_NAME}" | sha256sum -c; \
  fi && \
  tar xzf ${GCR_HELPER_DISTR_NAME} && \
  rm ${GCR_HELPER_DISTR_NAME} && \
  chmod +x docker-credential-gcr

FROM moby/buildkit:v0.23.1-rootless@sha256:6d65d4ed00cc9e9183da5f3e5ecbe033ed6409e557785eac11c14c5f11048731 as buildkit-rootless

COPY --from=buildkit /usr/local/bin/${ECR_HELPER_DISTR_NAME} /usr/local/bin/${ECR_HELPER_DISTR_NAME}
COPY --from=buildkit /usr/local/bin/docker-credential-gcr /usr/local/bin/docker-credential-gcr
