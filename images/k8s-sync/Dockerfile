FROM alpine:3.21.2@sha256:56fa17d2a7e7f168a043a2712e63aed1f8543aeafdcee47c58dcffe38ed51099

RUN apk add --no-cache wget

ARG TARGETARCH
# Get mutagen agent
RUN MUTAGEN_VERSION="0.18.0" && \
  mutagen_distr_name="mutagen_linux_${TARGETARCH}_v${MUTAGEN_VERSION}.tar.gz" && \
  wget "https://github.com/mutagen-io/mutagen/releases/download/v${MUTAGEN_VERSION}/${mutagen_distr_name}" && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "c82bde0ecd3810650087a8fd99e8baf4a3119b85a9cb14155a0d9209600374d4 ${mutagen_distr_name}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "c1621eede2cd9d36cd98d3fa419c843ecc1fb27e854103c754fcad50f4f4bb02 ${mutagen_distr_name}" | sha256sum -c; \
  fi && \
  tar xzf ${mutagen_distr_name} --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_${TARGETARCH} > /usr/local/bin/mutagen-agent && \
  rm ${mutagen_distr_name} && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
