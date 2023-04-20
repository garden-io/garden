---
title: Connecting a local application to a K8s cluster (Local Mode)
order: 4
---

# Connecting a local application to a K8s cluster (Local Mode)

## Glossary

* **Target Garden service** - a [Garden service](../using-garden/services.md) which will be deployed in _local mode_.
* **Target Kubernetes workload** or **target k8s workload** -
  a [Kubernetes Workload](https://kubernetes.io/docs/concepts/workloads/) deployed in a k8s cluster on the basis of the
  Garden service config.
* **Local app** - a locally deployed and running application which is supposed to replace a target Garden service
  configured in _local mode_.

## Development status

This feature is still **experimental**. We're still working on some open tasks to improve the feature
stability and usability. It means that:

* some **incompatible changes can be made** until the first non-experimental release
* there are some functional limitations, see the **Current limitations** section below

## Introduction

By configuring a Garden service in _local mode_, one can replace a target Kubernetes workload in a k8s cluster with a
local app (i.e. an application running on your local machine).

_Local mode_ feature is only supported by certain action types and providers.

### Supported action types

* [`container`](../reference/action-types/Deploy/container.md)
* [`kubernetes`](../reference/action-types/Deploy/kubernetes.md)
* [`helm`](../reference/action-types/Deploy/helm.md)

### Supported providers

* [`kubernetes`](../reference/providers/kubernetes.md)
* [`local kubernetes`](../reference/providers/local-kubernetes.md)

## Pre-requisites

Local mode uses `kubectl` port-forwarding and plain SSH port forwarding under the hood.

Requirements for the local machine environment:

* OpenSSH 7.6 or higher
* Kubectl

## Current limitations

There is a number of functional limitations in the current version.

### Reachability of the underlying services

The best matching use-case for _local mode_ is to locally run an "isolated" service, i.e. a service that does not make
any calls to other services.

If your service makes HTTP calls to some other services using k8s DNS names, then such calls will fail because the local
DNS configuration is not aware about any DNS names configured in the k8s cluster.

A concrete example can be found in the [`local-mode project`](../../examples/local-mode).

### Compatibility with dev mode

A service cannot be running in local and dev modes simultaneously. Local mode always takes precedence over dev mode if
both are configured in the relevant `garden.yml` configuration file and if both `--local` and `--dev` flags are enabled.

### Windows compatibility

The _local mode_ is not supported natively for Windows OS. It should be used with WSL in Windows environments.

### Number of the services in local mode

Only one container can be run in local mode for each [`kubernetes`](../reference/action-types/Deploy/kubernetes.md)
or [`helm`](../reference/action-types/Deploy/helm.md) service. This limitation is planned to be removed in Garden
Core `0.13`.

### Cluster state on exit

The _local mode_ leaves the proxy container deployed in the target k8s cluster after exit. The affected services must be
re-deployed manually by using `garden deploy`.

## How it works

Usually, a Garden service _declares_ a configuration and a deployment policy of a k8s service. A typical deployment flow
looks like this: the Garden service takes its `Dockerfile`, builds an image if necessary, configures a Docker container,
configures k8s entities and deploys them to the k8s cluster.

The _local mode_ changes the usual deployment flow. It does the following on-the-fly modifications to the target k8s
cluster in the deployment phase:

1. The target k8s workload's container is replaced by a special proxy container which is based
   on **[openssh-server](https://docs.linuxserver.io/images/docker-openssh-server)**. This container exposes its SSH
   port and the same HTTP ports as the target Garden service.
2. The number of replicas of the target k8s workload is always set to `1`.
3. The local app is started by Garden if `localMode.command` configuration option is specified in the
   service's `garden.yml`. Otherwise, the local app should be started manually.
4. The SSH port forwarding from a randomly assigned local port to the proxy container SSH port is initialized by means
   of `kubectl port-forward` command.
5. The reverse port forwarding (on top of the previous SSH port forwarding) between the remote proxy container's HTTP
   port and the local application HTTP port is established by means of `ssh` command.

This connection schema allows to route the target k8s workload's traffic to the local app and back over the proxy
container deployed in the k8s cluster. The actual service is running on a local machine, and the workload k8s service is
replaced by the proxy container which connects the local app with the k8s cluster via port-forwarding.

In order to maintain secure connections, Garden generates a new SSH key pair for each service running in _local mode_ on
every CLI execution.

**Note!** Garden automates the SSH key acceptance with option `-oStrictHostKeyChecking=accept-new`, this is the reason
why you need [OpenSSH 7.6](https://www.openssh.com/txt/release-7.6) or higher.

## Configuration

To configure a service for local mode, add `localMode` to your `Deploy` action configuration to specify your target
services.

### Health-checks

The startup, readiness and liveness probes are disabled for all services running in local mode. This has been done
because of some technical reasons.

The lifecycle of a local app can be completely controlled by a user. Thus, the health checks may be unwanted and
obstructing.

The k8s cluster readiness checks are applied to a proxy container which sends the traffic to the local app.
When a readiness probe happens, the target local app and the relevant port forward are not ready yet. Thus, the
readiness probe can cause the failure of the _local mode_ startup.

The liveness checks can cause unnecessary re-deployment of the proxy container in the target cluster.
Also, those checks create some extra traffic to the local app. That might be noisy and unnecessary if the local
service is running in the debugger.

### Configuring local mode for `container` action type

```yaml
kind: Build
name: node-service
type: container

---

kind: Deploy
name: node-service
type: container
build: node-service
...
spec:
  localMode:
    ports:
      - local: 8090 # The port of the local app, will be used for port-forward setup.
        remote: 8080 # The port of the remote app, will be used for port-forward setup.
    # Starts the local app which will replace the target one in the k8s cluster.
    # Optional. If not specified, then the local app should be started manually.
    command: [ npm, run, serve ]
    # Defines how to restart the local app on failure/exit.
    # Optional. If not specified, then the default values will be applied.
    restart:
      delayMsec: 2000 # 2 sec delay between local app restarts
      max: 100 # limit restart attempts to 100
    ...
...
```

An example can be found in the [`local-mode project`](../../examples/local-mode).

### Configuring local mode for `kubernetes` and `helm` action types

```yaml
kind: Build
name: backend
type: container

---

kind: Deploy
name: backend
type: kubernetes # this example looks the same for helm actions (i.e. with `type: helm`)
build: backend
localMode:
  ports:
    - local: 8090
      remote: 8080
  command: [ "../backend-local/main" ]
  # Target resource selector is necessary for `kubernetes` and `helm` action types
  target:
    kind: Deployment
    name: backend-deployment
    containerName: backend
...
# manifests or files
```

A `kubernetes` example can be found in the [`local-mode-k8s project`](../../examples/local-mode-k8s).
A `helm` example can be found in the [`local-mode-helm project`](../../examples/local-mode-helm).

## Deploying with local mode

To deploy your services with _local mode_ enabled, you can use `deploy` or `dev` commands:

```sh
# Deploy specific services in local mode:
garden deploy --local=myservice
garden deploy --local=myservice,my-other-service

# Deploy all applicable services in local mode:
garden deploy --local
garden deploy --local=*

# The dev command can deploy specific services in local mode:
garden dev --local=myservice
garden dev --local=myservice,my-other-service

# The dev command can deploy all applicable services in local mode:
garden dev --local
```

_Local mode_ always runs in persistent mode, it means that the Garden process won't exit until it's terminated
explicitly. All port-forwards established by _local mode_ will be stopped on the process exit. The local application
will be stopped if it was started via the `localMode.command` configuration option. Otherwise, if the local application
was started manually, it will continue running.

## Watching the local application's logs

If you run your local application with the `localMode.command` configuration option, then you can easily watch the local
application's logs in real-time by running a `garden` command with `verbose` log level:

```shell
garden deploy --local -l 3
# or
garden dev --local -l 3
```

Otherwise, you can find the logs in `.garden/deploy.debug.*.log` files.
