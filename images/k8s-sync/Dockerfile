FROM alpine:3.13.5

RUN apk add --no-cache curl

# Get mutagen agent
RUN curl -fsSL "https://github.com/garden-io/mutagen/releases/download/v0.12.0-garden-alpha1/mutagen-agent-linux-amd64.tar.gz" \
  | tar xz --to-stdout mutagen-agent \
  > /usr/local/bin/mutagen-agent && chmod +x /usr/local/bin/mutagen-agent
