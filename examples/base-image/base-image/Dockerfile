FROM golang:1.11.9-alpine3.9

WORKDIR /go/src/app

ONBUILD COPY *.go ./
ONBUILD RUN go build .

ENTRYPOINT ./app

EXPOSE 8080
