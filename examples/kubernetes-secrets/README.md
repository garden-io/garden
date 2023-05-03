# Kubernetes Secrets

This is a simple variation on the [demo project](../demo-project/README.md) example, adding a Secret reference to
one of the modules.

## Setup

_Note: The commands below assume you're running a local Kubernetes cluster. Please adjust the commands accordingly if you're running against a remote environment (setting the `--env` parameter and the correct `--namespace` for kubectl)._

You can start by creating a namespace for the project and secrets to live in:

```sh
kubectl create namespace kubernetes-secrets
```

Then create the Secret in your Kubernetes cluster:

```sh
kubectl --namespace=kubernetes-secrets create secret generic my-secret --from-literal=my-key=superdupersecret
```

Now you can deploy the services:

```sh
garden deploy
```

Finally, try calling the frontend service and observe the value you set in the Secret above:

```sh
garden call backend
# Outputs: superdupersecret
```
