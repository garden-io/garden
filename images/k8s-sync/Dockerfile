FROM alpine:3.22.1@sha256:4bcff63911fcb4448bd4fdacec207030997caf25e9bea4045fa6c8c44de311d1

# Upgrade packages to pick up security fixes (libcrypto3, libssl3)
RUN apk upgrade --no-cache

RUN apk add --no-cache wget

ARG TARGETARCH
# Get mutagen agent
RUN MUTAGEN_VERSION="0.18.1" && \
  mutagen_distr_name="mutagen_linux_${TARGETARCH}_v${MUTAGEN_VERSION}.tar.gz" && \
  wget "https://github.com/mutagen-io/mutagen/releases/download/v${MUTAGEN_VERSION}/${mutagen_distr_name}" && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "7735286c778cc438418209f24d03a64f3a0151c8065ef0fe079cfaf093af6f8f ${mutagen_distr_name}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "bcba735aebf8cbc11da9b3742118a665599ac697fa06bc5751cac8dcd540db8a ${mutagen_distr_name}" | sha256sum -c; \
  fi && \
  tar xzf ${mutagen_distr_name} --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_${TARGETARCH} > /usr/local/bin/mutagen-agent && \
  rm ${mutagen_distr_name} && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
