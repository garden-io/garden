FROM moby/buildkit:v0.23.1@sha256:dbc2dfd9342fd5c891ea94e9774c15cab985681e5ff995a9e366066aa0b9b2b4 as buildkit

RUN apk add --no-cache wget

ARG TARGETARCH
# ECR credential helper
RUN cd /usr/local/bin && \
  ECR_HELPER_VERSION="0.10.0" && \
  ECR_HELPER_DISTR_NAME="docker-credential-ecr-login" && \
  wget https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/${ECR_HELPER_VERSION}/linux-$TARGETARCH/${ECR_HELPER_DISTR_NAME} && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "90fd5506d242a26b0e116b0a1ee7e67aa469e653f641a19939fe27b53bc4d20f  ${ECR_HELPER_DISTR_NAME}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "6c4392e081a08bfd0dcfe8baf62f3dbb6fdf41a99d426bdddddfb32b10ea2a75  ${ECR_HELPER_DISTR_NAME}" | sha256sum -c; \
  fi && \
  chmod +x ${ECR_HELPER_DISTR_NAME}

ARG TARGETARCH
# GCR credential helper
RUN cd /usr/local/bin && \
  GCR_HELPER_VERSION="2.1.29" && \
  GCR_HELPER_DISTR_NAME="docker-credential-gcr_linux_$TARGETARCH-${GCR_HELPER_VERSION}.tar.gz" && \
  wget https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v${GCR_HELPER_VERSION}/${GCR_HELPER_DISTR_NAME} && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "9e676f2233b93e763276101dd8530e634aebf5d31d5581f64e7ffa978aefa0d8  ${GCR_HELPER_DISTR_NAME}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "edb3b0c1f667fb1fc5250d84a4d623886b3f0313d2838ed20885018c141348f9  ${GCR_HELPER_DISTR_NAME}" | sha256sum -c; \
  fi && \
  tar xzf ${GCR_HELPER_DISTR_NAME} && \
  rm ${GCR_HELPER_DISTR_NAME} && \
  chmod +x docker-credential-gcr

FROM moby/buildkit:v0.23.1-rootless@sha256:6d65d4ed00cc9e9183da5f3e5ecbe033ed6409e557785eac11c14c5f11048731 as buildkit-rootless

COPY --from=buildkit /usr/local/bin/${ECR_HELPER_DISTR_NAME} /usr/local/bin/${ECR_HELPER_DISTR_NAME}
COPY --from=buildkit /usr/local/bin/docker-credential-gcr /usr/local/bin/docker-credential-gcr
