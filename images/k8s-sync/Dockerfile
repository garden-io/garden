FROM alpine:3.15.4

RUN apk add --no-cache curl

# Get mutagen agent
RUN curl -fsSL "https://github.com/mutagen-io/mutagen/releases/download/v0.14.0/mutagen_linux_amd64_v0.14.0.tar.gz" \
  | tar xz --to-stdout mutagen-agents.tar.gz \
  | tar xz --to-stdout linux_amd64 \
  > /usr/local/bin/mutagen-agent && \
  chmod +x /usr/local/bin/mutagen-agent && \
  mkdir -p /.garden && \
  ln -s /usr/local/bin/mutagen-agent /.garden/mutagen-agent
