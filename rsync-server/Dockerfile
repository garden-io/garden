FROM alpine:3.10.3

RUN apk add --no-cache rsync && \
  addgroup -g 1000 -S rsync && \
  adduser -u 1000 -S rsync -G rsync

ADD entrypoint.sh /

ENTRYPOINT ["/entrypoint.sh"]
