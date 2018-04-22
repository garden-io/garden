## Running against a remote Kubernetes cluster

### Setup

You need to have a running ingress controller on your cluster to route requests to
the deployed services. This can generally be any controller of your choosing, such
as the nginx ingress controller.

You also need a configured [context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
on your development machine.

Then all you need to do is configure the environment and provider in your project
`garden.yml`. You need to specify your configured context and the hostname of your 
ingress controller. Example:

```yaml
    project:
      environments:
        dev:
          providers:
            kubernetes:
              context: my-dev-context
              ingressHostname: k8s-dev.mydomain.com
              ingressClass: nginx  # this is optional, but may be necessary for your ingress controller configuration
      defaultEnvironment: dev
```

Note that you need to have permissions to create namespaces and to create deployments, 
daemonsets, services and ingresses within the namespaces created. The plugin will 
create two namespaces per user and project, one to run services and another to manage
metadata and configuration (this is so that your environment can be reset without 
clearing your configuration variables).
