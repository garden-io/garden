---
title: Connecting a local application to a Kubernetes cluster (Local Mode)
order: 4
---

# Connecting a local application to a Kubernetes cluster (Local Mode)

## Glossary

* **Local app** - a locally running application that can be used instead of a `Deploy` action with a _local mode_
  configuration.
* **Target kubernetes workload** -
  a [Kubernetes Workload](https://kubernetes.io/docs/concepts/workloads/) produced from a `Deploy` action with a
  _local mode_ configuration that's deployed to the target kubernetes cluster.

## Development status

This feature is still **experimental**. We're still working on some open tasks to improve the feature
stability and usability. It means that:

* some **incompatible changes can be made** until the first non-experimental release
* there are some functional limitations, see the **Current limitations** section below

## Introduction

A local application can be used instead of a kubernetes workload by adding a _local mode_ configuration
to the `Deploy action`

_Local mode_ feature is only supported by certain action types and providers.

### Supported action types

* [`container`](../reference/action-types/Deploy/container.md)
* [`kubernetes`](../reference/action-types/Deploy/kubernetes.md)
* [`helm`](../reference/action-types/Deploy/helm.md)

### Supported providers

* [`kubernetes`](../reference/providers/kubernetes.md)
* [`local kubernetes`](../reference/providers/local-kubernetes.md)

## Pre-requisites

_Local mode_ uses `kubectl` port-forwarding and plain SSH port forwarding under the hood.

Requirements for the local machine environment:

* OpenSSH 7.6 or higher
* Kubectl

## Current limitations

There is a number of functional limitations in the current version.

### Reachability of the underlying workloads

The best matching use-case for _local mode_ is to locally run an "isolated" application, i.e. an application that does
not make any calls to other resources in the kubernetes cluster (i.e. databases or other applications).

If your application makes HTTP calls to some other kubernetes resources using kubernetes DNS names, then such calls will
fail because the local DNS configuration is not aware about any DNS names configured in the kubernetes cluster.

A concrete example can be found in the [`local-mode project`](../../examples/local-mode).

### Compatibility with sync mode

A `Deploy` action cannot be running in _local_ and _sync_ modes simultaneously. _Local mode_ always takes precedence
over _sync mode_ if both are configured in the relevant `garden.yml` configuration file and if both `--local`
and `--sync` flags are enabled.

### Windows compatibility

The _local mode_ is not supported natively for Windows OS. It should be used with WSL in Windows environments.

### Number of the containers running in local mode

Only one container can be run in _local mode_ for each [`kubernetes`](../reference/action-types/Deploy/kubernetes.md)
or [`helm`](../reference/action-types/Deploy/helm.md) `Deploy` action.

### Cluster state on exit

The _local mode_ leaves the proxy container deployed in the target kubernetes cluster after exit. The affected `Deploy`s
must be re-deployed manually by using `garden deploy`.

## How it works

Usually, a Garden `Deploy` action _declares_ a configuration and a deployment policy of a kubernetes workload.
A typical deployment flow looks like this:

1. build a container image if necessary
2. configure a docker container for the image
3. prepare kubernetes workloads to be deployed
4. deploy the configured kubernetes workloads to the target kubernetes cluster

The _local mode_ changes the usual deployment flow by changing the manifest configuration step (item 3 from the list
above) and the deployment step (item 4).

### Changes in workload configuration

_Local mode_ does the following modifications in the target kubernetes workload configuration before the actual
deployment:

1. Replaces target kubernetes workload's container with a special proxy container that is based
   on **[openssh-server](https://docs.linuxserver.io/images/docker-openssh-server)**. This container exposes its `SSH`
   port and the same `HTTP` ports as the `Deploy` action configured in _local mode_.
2. Sets the number of replicas of the target kubernetes workload is always set to `1`.
3. Disables the basic health-checks (startup, readiness and liveness probes). See the section below for details.

#### Health-checks

The startup, readiness and liveness probes are disabled for all `Deploy` axtions running in local mode. This has been
done because of some technical reasons.

The lifecycle of a local app can be completely controlled by a user. Thus, the health checks may be unwanted and
obstructing.

The kubernetes cluster readiness checks are applied to a proxy container which sends the traffic to the local app.
When a readiness probe happens, the target local app and the relevant port forward are not ready yet. Thus, the
readiness probe can cause the failure of the _local mode_ startup.

The liveness checks can cause unnecessary re-deployment of the proxy container in the target cluster.
Also, those checks create some extra traffic to the local app. That might be noisy and unnecessary if the local app is
running in the debugger.

### Changes in deployment execution

Once the kubernetes workloads are configured, _local mode_ executes the deployment step in a specific way:

1. The local app is started by Garden if `localMode.command` field is specified in the `Deploy` action configuration.
   Otherwise, the local app should be started manually.
2. The SSH port forwarding from a randomly assigned local port to the proxy container SSH port is initialized by means
   of `kubectl port-forward` command.
3. The reverse port forwarding (on top of the previous SSH port forwarding) between the remote proxy container's HTTP
   port and the local application HTTP port is established by means of `ssh` command.

As a result, the original target kubernetes workload is replaced by a workload that runs a proxy container, let's call
it a proxy-workload. The proxy-workload is connected with the local app via the 2-layered port-forwarding described
above. This connection schema allows to route the target kubernetes workload's traffic to the local app and back. For
the rest entities in the kubernetes cluster, the local app acts as an original kubernetes workload.

In order to maintain secure connections, Garden generates a new SSH key pair for each `Deploy` action running in _local
mode_ on **every** CLI execution.

**Note!** Garden automates the SSH key acceptance with option `-oStrictHostKeyChecking=accept-new`, this is the reason
why you need [OpenSSH 7.6](https://www.openssh.com/txt/release-7.6) or higher.

## Configuration

To configure a `Deploy` action for _local mode_, add `localMode` configuration entry to the `spec` field of
your `Deploy` action configuration. See the examples below for details.

### Configuring local mode for `container` action type

```yaml
kind: Build
name: node-app
type: container

---

kind: Deploy
name: node-app
type: container
dependencies:
  - build.node-app
...
spec:
  image: ${actions.build.node-app.outputs.deploymentImageId}
  localMode:
    ports:
      - local: 8090 # The port of the local app, will be used for port-forward setup.
        remote: 8080 # The port of the remote app, will be used for port-forward setup.
    # Starts the local app which will replace the target one in the kubernetes cluster.
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
dependencies:
  - build.backend
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

To run your `Deploy` actions in _local mode_, you can use `deploy` command with the special flag:

```sh
# Deploy specific Deploys in local mode:
garden deploy --local=app-1
garden deploy --local=app-1 app-2

# Deploy all applicable Deploys in local mode:
garden deploy --local
garden deploy --local=*
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
```

Otherwise, you can find the logs in `.garden/deploy.debug.*.log` files.
