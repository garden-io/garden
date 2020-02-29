---
title: TLS Project
---
# Local TLS example project

This project shows how you can configure a TLS certificate to use for local development on Kubernetes.

For the example to work you need to configure a local certificate authority (CA) on your computer for development. We'll use
[mkcert](https://github.com/FiloSottile/mkcert) for this purpose.

_Note: The source code for this project can be found at: [https://github.com/garden-io/garden/tree/v0.11.5/examples/local-tls](https://github.com/garden-io/garden/tree/v0.11.5/examples/local-tls)._

## Setup

### Step 1 - Install mkcert

If you don't have mkcert installed, follow the instructions [here](https://github.com/FiloSottile/mkcert#installation).

### Step 2 - Generate a certificate

After you've run `mkcert -install`, run

```sh
mkcert garden.dev '*.garden.dev'
```

_Note: You may choose another hostname if you prefer, but you'll need to update the project `garden.yml` accordingly._

### Step 3 - Configure the certificate in your Kubernetes installation

Create a Kubernetes Secret with your generated certificate and key.

```sh
kubectl create secret tls tls-garden-dev --key garden.dev+1-key.pem --cert garden.dev+1.pem
```

_The filenames above will be different if you used a different hostname._

### Step 4 - Configure the hostname in your hosts file

Add the `garden.dev` hostname to the hosts file on your machine, and have it point to the IP of your local cluster.
If you use Docker for Desktop, the IP will be `127.0.0.1`. If you use minikube, you can get the IP by running
`minikube ip`.

We recommend using the [hosts](https://github.com/alphabetum/hosts) tool (or something similar) to modify your hosts
file, but you may also edit it directly (it's at `/etc/hosts` on most platforms).

## Usage

Once you've completed the above, you can deploy the example project and the exposed ingress endpoints will be
secured with TLS!

Deploy the project:

```sh
garden deploy
```

And then try sending a simple request using:

```sh
garden call node-service/hello
```