# Connecting a local service to a k8s cluster (Local Mode)

## Glossary

* **Target Garden service** - a [Garden service](../using-garden/services.md) which will be deployed in _local mode_.
* **Target k8s service** or **target Kubernetes service** -
  a [Kubernetes service](https://kubernetes.io/docs/concepts/services-networking/service/) deployed in a k8s cluster on
  the basis of the Garden service config.
* **Local service** - a locally deployed and running application which is supposed to replace a target Garden service
  configured in _local mode_.

## Introduction

By configuring a Garden service in _local mode_, one can replace a target Kubernetes service in a k8s cluster with a
local service (i.e. an application running on your local machine).

## Pre-requisites

Local mode uses `kubectl` port-forwarding and plain SSH port forwarding under the hood.

Requirements for the local machine environment:

* OpenSSH 7.6 or higher
* Kubectl

## Current limitations

This is the initial release of **experimental** feature. The _local mode_ feature design and implementation is still in
progress. So, there is a number of functional limitations in the first release:

* **Windows compatibility.** The _local mode_ is not supported natively for Windows OS. It should be used with WSL in
  Windows environments.
* The _local mode_ creates port-forwarding **only for one service port** of a target Garden service. It picks up the
  first `TCP` port from the list of ports or just the first one if no `TCP` ports defined. Thus, if the service needs to
  talk to some data sources like databases, message brokers, etc. then all these services are assumed to be running
  locally.
* The _local mode_ is supported only by [container module type](./container-modules.md)
  and [kubernetes provider](../reference/providers/kubernetes.md). The `kubernetes` and `helm` module types will be
  supported later.
* The _local mode_ leaves the proxy container deployed in the target k8s cluster after exit. The affected services must
  be re-deployed manually by using `garden deploy`.

The next step is to fully integrate local services into remote clusters and to establish connections to all dependent
data sources and services.

## How it works

Usually, a Garden service _declares_ a configuration and a deployment policy of a k8s service. A typical deployment flow
looks like this: the Garden service takes its `Dockerfile`, builds an image if necessary, configures a Docker container,
configures k8s entities and deploys them to the k8s cluster.

The _local mode_ changes the usual deployment flow. It does the following on-the-fly modifications to the target k8s
cluster in the deployment phase:

1. The target k8s service container is replaced by a special proxy container which is based
   on **[openssh-server](https://docs.linuxserver.io/images/docker-openssh-server)**. This container exposes its SSH
   port and the same HTTP port as the target Garden service.
2. The number of replicas of the target k8s service is always set to `1`.
3. The local service is started by Garden if `localMode.command` configuration option is specified in the
   service's `garden.yml`. Otherwise, the local service should be started manually.
4. The SSH port forwarding from a randomly assigned local port to the proxy container SSH port is initialized by means
   of `kubectl port-forward` command.
5. The reverse port forwarding (on top of the previous SSH port forwarding) between the remote proxy container's HTTP
   port and the local application HTTP port is established by means of `ssh` command.

This connection schema allows to route the target k8s service's traffic to the local service and back over the proxy
container deployed in the k8s cluster. The actual service is running on a local machine, and the target k8s service is
replaced by the proxy container which connects the local service with the k8s cluster via port-forwarding.

In order to maintain secure connections, Garden generates a new SSH key pair for each service running in _local mode_ on
every CLI execution.

**Note!** Garden automates the SSH key acceptance with option `-oStrictHostKeyChecking=accept-new`, this is the reason
why you need [OpenSSH 7.6](https://www.openssh.com/txt/release-7.6) or higher. **This also produces new entries in the
local `~/.ssh/known_hosts` file.** Garden attempts to remove these entries on exit. If something goes wrong you can
inspect the `known_hosts` file and clean it up manually.

## Configuration

To configure a service for local mode, add `localMode` to your module/service configuration to specify your target
services.

### Health-checks

The readiness and liveness probes are disabled for all services running in local mode. This has been done because of
some technical reasons.

The lifecycle of a local service can be completely controlled by a user. Thus, the health checks may be unwanted and
obstructing.

The k8s cluster readiness checks are applied to a proxy container which sends the traffic to the local service.
When a readiness probe happens, the target local service and the relevant port forward are not ready yet. Thus, the
readiness probe can cause the failure of the _local mode_ startup.

The liveness checks can cause unnecessary re-deployment of the proxy container in the target cluster.
Also, those checks create some extra traffic to the local service. That might be noisy and unnecessary if the local
service is running in the debugger.

### Configuring local mode for `container` modules

```yaml
kind: Module
name: node-service
type: container
services:
  - name: node-service
    args: [ npm, start ]
    localMode:
      localPort: 8090 # The port of the local app, will be used for port-forward setup.
      # Starts the local app which will replace the target one in the k8s cluster.
      # Optional. If not specified, then the local app should be started manually.
      command: [ npm, run, serve ]
      # Defines how to restart the local app on failure/exit.
      # Optional. If not specified, then the default values will be applied.
      restart:
        delayMsec: 2000 # 2 sec delay between local app restarts
        max: 100 # limit restart attempts to 100
  ...
```

An example can be found in the [demo-project's backend service](../../examples/demo-project/backend/garden.yml).

## Deploying with local mode

To deploy your services with local mode enabled, you can use the `deploy` command:

```sh
# Deploy specific services in local mode:
garden deploy --local-mode=myservice
garden deploy --local-mode=myservice,my-other-service

# Deploy all applicable services in local mode:
garden deploy --local-mode
```

Once you quit/terminate the Garden command, all port-forwards established by the command will be stopped, but the
services (both local and remote ones) will still be left running.
