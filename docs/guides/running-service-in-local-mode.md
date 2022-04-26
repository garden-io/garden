# Connecting local service to k8s cluster (Local Mode)

You can replace a target service in k8s cluster with a local service (i.e. a service running on your local machine)
using _local mode_.

## Pre-requisites

Local mode uses `kubectl` port-forwarding and plain SSH port forwarding under the hood.

Requirements for the local machine environment:

* OpenSSH 7.6 or higher
* Kubectl

## How it works

Local mode does some on the fly modifications to the k8s target k8s cluster while deployment:

1. The target service (which is running in _local mode_) is replaced by a special proxy container which is based
   on **[openssh-server](https://docs.linuxserver.io/images/docker-openssh-server)**. This container exposes its SSH
   port and the same HTTP port as the target service.
2. The local service is started by Garden if `localMode.command` configuration option is specified in the
   service's `garden.yml`. Otherwise, the local service should be started manually.
3. The SSH port forwarding from a randomly assigned local port to the proxy container SSH port is initialized by means
   of `kubectl port-forward` command.
4. The reverse port forwarding (on top of the previous SSH port forwarding) between the remote proxy container's HTTP
   port and the local application HTTP port is established by means of `ssh` command.

This connection schema allows to route the target service's traffic to the local service and back over the proxy
container deployed in the k8s cluster.

In order to maintain secure connections, Garden generates a new SSH key pair for each service running in _local mode_ on
every CLI execution.

**Note!** Garden automates the SSH key acceptance with option `-oStrictHostKeyChecking=accept-new`, this is the reason
why you need [OpenSSH 7.6](https://www.openssh.com/txt/release-7.6) or higher. **This also produces new entries in the
local `~/.ssh/known_hosts` file.** Garden attempts to remove these entries on exit. If something goes wrong you can
inspect the `known_hosts` file and clean it up manually.

## Configuration

To configure a service for local mode, add `localMode` to your module/service configuration to specify your target
services:

### Configuring local mode for `container` modules

```yaml
kind: Module
name: node-service
type: container
services:
  - name: node-service
    args: [ npm, start ]
    localMode:
      localAppPort: 8090 # The port of the local service, will be used for port-forward setup
      command: [ npm, run, serve ] # Starts the local service which will replace the target one in the k8s cluster
      containerName: "node-service" # Optional. The name of the target service. It will be inferred automatically if this option is not defined.
  ...
```

### Configuring local mode for `kubernetes` and `helm` modules

TODO: not supported yet

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

## Troubleshooting

TODO
