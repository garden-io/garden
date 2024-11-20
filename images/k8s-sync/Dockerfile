FROM alpine:3.20.3@sha256:beefdbd8a1da6d2915566fde36db9db0b524eb737fc57cd1367effd16dc0d06d

RUN apk add --no-cache wget

ARG TARGETARCH
# Get mutagen agent
RUN MUTAGEN_VERSION="0.17.6" && \
  mutagen_distr_name="mutagen_linux_${TARGETARCH}_v${MUTAGEN_VERSION}.tar.gz" && \
  wget "https://github.com/mutagen-io/mutagen/releases/download/v${MUTAGEN_VERSION}/${mutagen_distr_name}" && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "1b826e121be59506e133d90dc2b8a0c820b92f480d9b2b230d8b389d6178a6cf ${mutagen_distr_name}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "2a383cb572a1bdad83f7c4be3cc4a541a58e6c9e11e326ee4cc2d0e14f9d003a ${mutagen_distr_name}" | sha256sum -c; \
  fi && \
  tar xzf ${mutagen_distr_name} --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_${TARGETARCH} > /usr/local/bin/mutagen-agent && \
  rm ${mutagen_distr_name} && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
