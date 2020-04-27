FROM danifernandezs/skopeo:1.41.0-alpine3.10.3

RUN apk add --no-cache curl
RUN cd /usr/local/bin && \
  curl -O https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.4.0/linux-amd64/docker-credential-ecr-login && \
  chmod +x docker-credential-ecr-login

RUN curl -fsSL "https://github.com/GoogleCloudPlatform/docker-credential-gcr/releases/download/v2.0.1/docker-credential-gcr_linux_amd64-2.0.1.tar.gz" \
  | tar xz --to-stdout ./docker-credential-gcr \
  > /usr/local/bin/docker-credential-gcr && chmod +x /usr/local/bin/docker-credential-gcr
