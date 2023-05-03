# Pulumi + kubernetes example

This example project demonstrates the basics of Garden's pulumi plugin. There are two modules:
1. `k8s-namespace`: Creates a namespace, and returns the namespace name as a stack output.
2. `k8s-deployment`: Creates a Deployment and a Service in the namespace created by `k8s-namespace` (the namespace name is read in via a stack reference).

By default, this project expects to run on a local Kubernetes cluster.

To deploy both stacks, run `garden deploy`.

That's it!
