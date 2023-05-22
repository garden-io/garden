FROM alpine:3.15.4@sha256:a777c9c66ba177ccfea23f2a216ff6721e78a662cd17019488c417135299cd89

RUN apk add --no-cache curl

# Get mutagen agent
RUN curl -fsSL "https://github.com/mutagen-io/mutagen/releases/download/v0.15.0/mutagen_linux_amd64_v0.15.0.tar.gz" \
  | tar xz --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_amd64 \
  > /usr/local/bin/mutagen-agent && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
