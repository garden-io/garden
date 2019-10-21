FROM alpine:3.10.2
RUN apk add entr ca-certificates & mkdir app
WORKDIR /app
COPY bin/ /app/
# RUN ${EXTRA_RUN}
ENTRYPOINT ["/app/binary"]