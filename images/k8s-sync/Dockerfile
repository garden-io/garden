FROM alpine:3.15.4@sha256:a777c9c66ba177ccfea23f2a216ff6721e78a662cd17019488c417135299cd89

RUN apk add --no-cache wget

# Get mutagen agent
RUN wget "https://github.com/mutagen-io/mutagen/releases/download/v0.15.0/mutagen_linux_amd64_v0.15.0.tar.gz" && \
  echo "dd4a0b6fa8b36232108075d2c740d563ec945d8e872c749ad027fa1b241a8b07  mutagen_linux_amd64_v0.15.0.tar.gz" | sha256sum -c && \
  tar xzf mutagen_linux_amd64_v0.15.0.tar.gz --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_amd64 > /usr/local/bin/mutagen-agent && \
  rm mutagen_linux_amd64_v0.15.0.tar.gz && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
