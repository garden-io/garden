FROM moby/buildkit:v0.10.5 as deps

RUN apk add --no-cache curl

# ECR credential helper
RUN cd /tmp && \
  curl -O https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.6.0/linux-amd64/docker-credential-ecr-login && \
  chmod +x docker-credential-ecr-login

# GCR credential helper
RUN curl -fsSL "https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v2.0.1/docker-credential-gcr_linux_amd64-2.0.1.tar.gz" \
  | tar xz --to-stdout ./docker-credential-gcr \
  > /tmp/docker-credential-gcr && chmod +x /tmp/docker-credential-gcr

FROM moby/buildkit:v0.10.5 as buildkit

COPY --from=deps /tmp/docker-credential-ecr-login /usr/local/bin/docker-credential-ecr-login
COPY --from=deps /tmp/docker-credential-gcr /usr/local/bin/docker-credential-gcr

FROM moby/buildkit:v0.10.5-rootless as buildkit-rootless

COPY --from=deps /tmp/docker-credential-ecr-login /usr/local/bin/docker-credential-ecr-login
COPY --from=deps /tmp/docker-credential-gcr /usr/local/bin/docker-credential-gcr
