# Remote Kubernetes example project

This project shows how you can configure Garden to work against a remote Kubernetes cluster, in addition to a local
cluster. We also go through how to configure TLS for your `container` services, and set up
[in-cluster building](https://docs.garden.io/guides/in-cluster-building).

The example follows the [Remote Kubernetes guide](https://docs.garden.io/guides/remote-kubernetes). Please look
at the guide for more details on how to configure your own project.

## Setup

### Prerequisites

You need to have a running Kubernetes cluster, that you have API access to. If you haven't already, you'll need
to configure a `kubectl` context that has access to your cluster.
Please refer to your cluster provider for how to do that.

### Step 1 - Update the context and cluster hostname in your config

You need to update the `remote` environment configuration in your project `garden.yml`.
Replace `my-context` with your configured `kubectl` context for the remote cluster, and `mycluster.example.com`
with a hostname that points to the ingress controller on your cluster.

If you don't have an ingress controller configured, you can add `setupIngressController: nginx` to the provider
configuration, but you will then still need to work out your DNS to route requests to the cluster (how best to do
that varies quite a bit by how you're hosting the cluster).

### Step 2 - Get a certificate for your cluster hostname

How you do this will depend on how you generally manage DNS. Basically, you need a valid TLS certificate and key for
the hostname you configured above. If you don't have a prior preference on how to create certificates, we suggest using
Let's Encrypt's [certbot](https://certbot.eff.org) and using the `certonly` option to generate certs.

### Step 3 - Configure the certificate in your Kubernetes installation

Create a Kubernetes Secret with your generated certificate and key (replace the filenames appropriately).

```sh
kubectl create secret tls garden-example --key my.key --cert my.crt
```

### Step 4 - Initialize cluster-wide services

To start the services Garden needs to build images in your cluster, run the following command:

```sh
garden --env=remote plugins kubernetes cluster-init
```

## Usage

Once you've completed the above, you can run deploy the project to the `remote` environment, by setting the
`--env` flag when running `garden` (or you can change the `defaultEnvironment` entry in your `garden.yml`):

```sh
garden --env=remote deploy
```

And then try sending a simple request using:

```sh
garden --env=remote call node-service/hello
```
