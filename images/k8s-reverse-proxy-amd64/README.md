# Introduction

This is a lightweight Docker container to set up a reversed proxy server in a k8s cluster to replace an actual k8s
container and to route its traffic to a local service.

# Environment variables

The Docker image is based on the [docker-openssh-server](https://github.com/linuxserver/docker-openssh-server), so it
supports all its environment variables. It also introduces some own mandatory environment variables:

* `APP_PORT` - must have the value of `containerPort` variable of a k8s container which should be replaced by a reversed
  proxy
