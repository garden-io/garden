# Remote Kubernetes example project

This project shows how you can configure Garden to work against a remote Kubernetes cluster, in addition to a local
cluster.

The example follows the [Remote Kubernetes guide](https://docs.garden.io/guides/remote-kubernetes.md). Please look
at the guide for more details on how to configure your own project.

## Setup

### Prerequisites

You need to have a running Kubernetes cluster, that you have API access to, and that has an exposed _nginx_ ingress
controller. If you haven't already, you'll need to configure a `kubectl` context that has access to your cluster.
Please refer to your cluster provider for how to do that.

If you don't already have one, you also need to configure a private container registry. You could for example use
[quay.io](https://quay.io), create a private registry on [Docker Hub](https://hub.docker.io), or use the registry
provided by your cloud provider.

### Step 1 - Update the context and cluster hostname in your config

You need to update the `remote` environment configuration in your project `garden.yml`.
Replace `my-context` with your configured `kubectl` context for the remote cluster, and `mycluster.example.com`
with a hostname that points to the ingress controller on your cluster.

### Step 2 - Get a certificate for your cluster hostname

How you do this will depend on how you generally manage DNS. Basically, you need a valid TLS certificate and key for
the hostname you configured above. If you don't have a prior preference on how to create certificates, we suggest using
Let's Encrypt's [certbot](https://certbot.eff.org) and using the `certonly` option to generate certs.

### Step 3 - Configure the certificate in your Kubernetes installation

Create a Kubernetes Secret with your generated certificate and key (replace the filenames appropriately).

```sh
kubectl create secret tls garden-example --key my.key --cert my.crt
```

### Step 4 - Configure a remote container registry

Each different container registry will provide different instructions on how to configure Kubernetes to authenticate.
You can also use [Heptio's guides](http://docs.heptio.com/content/private-registries.html) for configuring private
registries.

You'll also need to login to the `docker` CLI, so that images can be pushed to the registry. Please refer
to your registry's documentation on how to do that (for Docker Hub you simply run `docker login`).

_Note that if you're using GKE along with GCR, and your deployment registry is in the same project as the GKE cluster,
you can remove the `imagePullSecrets` section from the `garden.yml` and skip creating the auth secret._

When storing the registry authorization via `kubectl create secret docker-registry`, use the name
`garden-example-registry-auth` for the secret, and place it in the `default` namespace (or update the `garden.yml`
configuration with the name and namespace you chose).

## Usage

Once you've completed the above, you can run deploy the project to the `remote` environment, by setting the
`--env` flag when running `garden` (or you can change the `defaultEnvironment` entry in your `garden.yml`):

```sh
garden --env remote deploy
```

And then try sending a simple request using:

```sh
garden --env remote call node-service/hello
```