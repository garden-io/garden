# Connecting local service to k8s cluster (Local Mode)

You can replace a target service in k8s cluster with a local service (i.e. a service running on your local machine)
using _local mode_.

The target service in the k8s cluster will be replaced by a proxy container with an ssh server running,
and the reverse port forwarding will be automatically configured to route the traffic to the local service and back.

TODO

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

TODO, not supported yet

## Deploying with local mode

To deploy your services with local mode enabled, you can use the `deploy` command:

```sh
# Deploy specific services in local mode:
garden deploy --local-mode=myservice
garden deploy --local-mode=myservice,my-other-service

# Deploy all applicable services in local mode:
garden deploy --local-mode`
```

Once you quit/terminate the Garden command, all port-forwards established by the command will be stopped, but the
services (both local and remote ones) will still be left running.

## Troubleshooting

TODO
