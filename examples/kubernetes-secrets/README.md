# Kubernetes Secrets

This is a simple variation on the [demo project](../demo-project/README.md) example, adding a Secret reference to
one of the modules.

## Setup

The commands below assume you're running a local Kubernetes cluster. Please adjust the commands accordingly if you're
running against a remote environment (setting the `--env` parameter and the correct `--namespace` for kubectl).

### 1. Initialize the project

```sh
garden init
```

### 2. Create the Secret

```sh
kubectl --namespace=kubernetes-secrets create secret generic my-secret --from-literal=my-key=superdupersecret
```

## Usage

First deploy the services:

```sh
garden deploy
```

Then try calling the frontend service and observe the value you set in the Secret above:

```sh
garden call backend
# Outputs: superdupersecret
```
