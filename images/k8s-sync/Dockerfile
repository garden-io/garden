FROM alpine:3.13.5

RUN apk add --no-cache curl

# Get mutagen agent
RUN curl -fsSL "https://github.com/garden-io/mutagen/releases/download/v0.12.0-garden-alpha2/agent_linux_amd64_v0.12.0-beta3.tar.gz" \
  | tar xz --to-stdout mutagen-agent \
  > /usr/local/bin/mutagen-agent && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
