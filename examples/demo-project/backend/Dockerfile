FROM golang:1.8.3-alpine
MAINTAINER Aurelien PERRIER <a.perrier89@gmail.com>

ENV webserver_path /go/src/github.com/perriea/webserver/
ENV PATH $PATH:$webserver_path

WORKDIR $webserver_path
COPY webserver/ .

RUN go build .

ENTRYPOINT ./webserver

EXPOSE 8080
