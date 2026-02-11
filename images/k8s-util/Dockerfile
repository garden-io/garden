ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# Upgrade packages to pick up security fixes (rsync, libcrypto3, libssl3)
RUN apk upgrade --no-cache

RUN apk add --no-cache rsync skopeo

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

RUN adduser -g 1000 -D user && \
  mkdir -p /data && \
  chown -R user:user /data

USER user

ADD rsync-server.sh /
