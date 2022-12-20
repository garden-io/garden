---
title: Local K8s Plugin Configuration
order: 2
---

# Local K8s Plugin Configuration

## Requirements

To use the `local-kubernetes` plugin you need to have a local installation of Kubernetes.

Garden is committed to supporting the _latest six_ stable versions of Kubernetes (i.e. if the latest stable version is v1.17.x, Garden supports v1.12.x and newer).

The officially supported variants of local Kubernetes are the latest stable versions of

- [Docker Desktop](https://docs.docker.com/engine)
- [Minikube](https://github.com/kubernetes/minikube)
- [MicroK8s](https://microk8s.io)
- [KinD](https://github.com/kubernetes-sigs/kind)

Other distributions may also work, but are not routinely tested or explicitly supported. Please don't hesitate to file issues, PRs or requests for your distribution of choice!

For any variant that runs in a VM on your machine (such as Docker Desktop and Minikube), we recommend tuning the size of the VM (in terms of CPU and RAM) to your needs, which will vary by the weight of the project(s) you're running.

The following pages walk you through installing Kubernetes locally
and configuring the plugin.

