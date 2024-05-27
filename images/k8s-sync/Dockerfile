FROM alpine:3.19.1@sha256:6457d53fb065d6f250e1504b9bc42d5b6c65941d57532c072d929dd0628977d0

RUN apk add --no-cache wget

ARG TARGETARCH
# Get mutagen agent
RUN MUTAGEN_VERSION="0.17.5" && \
  mutagen_distr_name="mutagen_linux_${TARGETARCH}_v${MUTAGEN_VERSION}.tar.gz" && \
  wget "https://github.com/mutagen-io/mutagen/releases/download/v${MUTAGEN_VERSION}/${mutagen_distr_name}" && \
  if [ "$TARGETARCH" = "amd64" ]; then \
    echo "cabee0af590faf822cb5542437e254406b0f037df43781c02bf6eeac267911f6 ${mutagen_distr_name}" | sha256sum -c; \
  elif [ "$TARGETARCH" = "arm64" ]; then \
    echo "bbe92496c2bad6424a879490ca5b49da36c80e28e7b866201fcaf7a959037237 ${mutagen_distr_name}" | sha256sum -c; \
  fi && \
  tar xzf ${mutagen_distr_name} --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_amd64 > /usr/local/bin/mutagen-agent && \
  rm ${mutagen_distr_name} && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
