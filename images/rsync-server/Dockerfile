FROM alpine:3.11.3

RUN apk add --no-cache rsync

ADD entrypoint.sh /

ENTRYPOINT ["/entrypoint.sh"]
