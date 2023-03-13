---
title: 3. Set Up Ingress, TLS and DNS
order: 3
---

# 3. Set Up Ingress, TLS and DNS

Starting from version 0.13 Garden will no longer support the cert-manager extension (previously built-in Garden by default), this means that you will need to implement a custom solution to get it deploy into your cluster and get your certificates generated.

But don't worry! We got you covered, in this document we are going to be building a `garden configuration` that will allow us to deploy `cert-manager`, `external-dns` (generating DNS automatically on CloudFlare) and a hello-world React application that will help us to test our certificates strategy.

## About

This project deploys a small React service in a Kubernetes Cluster and exposes it to an Nginx ingress with HTTPs by using the following Kubernetes Operators:

| service       |   version  |
|---------------|------------|
| cert-manager  |  v1.11.0   |
| external-dns  |   v6.13.3  |

By using a combination of `container` and `helm` modules supported by Garden and with minimal manual intervention, we are able to rapidly deploy and provision our cluster with everything it needs for automatic TLS and DNS.

This project was developed and battle tested using `Garden v0.12.52`.

## Prerequisites

To execute this project successfully we assume the following:

1. A Kubernetes cluster with the correct Security Groups/Firewall rules to allow HTTP/HTTPs.
2. A domain name that you own (e.g. example.com). This domain name can be purchased anywhere but we expect for this example that Cloudflare is at least your [primary DNS provider](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup).
3. An account in Cloudflare with at least 1 DNS hosted zone.
   - You will also need a Cloudflare API Token with the permissions defined [here](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/cloudflare.md#creating-cloudflare-credentials)
4. Some prior knowledge in [cert-manager](https://cert-manager.io/docs/) and [ExternalDNS](https://github.com/kubernetes-sigs/external-dns) and their use cases.
5. A Docker Registry (Docker Hub, etc.) and a Kubernetes secret with the credentials of the registry.

## Project Structure Setup

First, let's start by creating our project structure and files we are going to be using across our project.

```bash
mkdir tls-and-dns && cd $_
mkdir charts
mkdir charts/cluster-issuers
mkdir frontend
touch frontend/garden.yml
touch frontend/Dockerfile
touch garden.yml
touch project.garden.yml
```

After creating those files and directories you should have the following project structure.

```bash
├── charts
│   ├── cluster-issuers <- This chart will deploy certificates and cluster-issuers that we are going to need to operate cert-manager.
├── frontend <- Will contain a React Application that we are going to use to deploy with Garden
│   ├── Dockerfile
│   ├── garden.yml
├── garden.yml <- Contains the module config for external-dns & cert-manager
├── project.garden.yml <- Contains the project configuration/env-vars.
```

⚠️ This project is available under our examples folder, if you have any questions or want to check if you are following the step-by-step guide correctly you can always check the source code. [examples/tls-and-dns](https://github.com/garden-io/garden/tree/main/examples)

### Creating our Garden Project

First, let's make our new folder a repository.

```bash
git init
```

And then it's time to configure the hearth of our `Garden configuration` which is the `project`.

Edit the `project.garden.yml` with your favorite editor and let's add the following code into it.

First, the project and environment configuration. In this project we are just going to have 1 environment called `prod` so let's add the configuration for it.

```YAML
kind: Project
name: tls-and-dns
defaultEnvironment: prod

environments:
  - name: prod
    production: true
    defaultNamespace: ${var.DEFAULT_NAMESPACE}
    variables:
      base-hostname: ${var.CF_DOMAIN[0]}
```

Now, in order to deploy our configuration we are going to be using the [Kubernetes Provider](https://docs.garden.io/reference/providers/kubernetes) which is a powerful solution to deploy Kubernetes Manifests/Helm Charts into our Kubernetes clusters with Garden.

Add the following content to the `project.garden.yml`

```YAML
providers:
  - name: kubernetes
    environments: [prod]
    context: your-k8s-context # Change this to your Kubernetes Context!
    namespace: ${var.DEFAULT_NAMESPACE}
    setupIngressController: nginx
    # tlsCertificates:
    #   - name: staging-cert
    #     secretRef:
    #       name: staging-cert
    deploymentRegistry:
      hostname: "${var.registryHostname}"
      namespace: "${var.registryNamespace}"
    imagePullSecrets:
    - name: regcred
      namespace: default # Leave this in default to make configuration easier.
```

To get your context name you can simply use:

```bash
kubectl config get-contexts
kubectl config current-context
```

Now you can copy and paste your context to your `provider.context` parameter.

At this stage of the demo we are going to leave the `tlsCertificates` block commented out and we will revisit it later in a different section of this project.

For the `deploymentRegistry` and `imagePullSecrets` we require that you already have a Docker Registry (prerequisite #5). If you already own one, please create a secret with your credentials using the following command:

```bash
kubectl create secret generic regcred \
    --from-file=.dockerconfigjson=$HOME/.docker/config.json \
    --type=kubernetes.io/dockerconfigjson
```

If you decide to setup the secret with a different name make sure to update it in the `imagePullSecrets` configuration.

Now let's add some variables to the `project.garden.yml` that we are going to be using across our configuration in the project.

```YAML
variables:
  # Variables for Docker Registry
  registryHostname: docker.io
  registryNamespace: your-registry-namespace # Username ex. shankyweb in Dockerhub
  # Variables for Kubernetes
  DEFAULT_NAMESPACE: default # Frontend will be deployed in this namespace.
  # Cert-Manager variables
  CERT_MANAGER_INSTALL_CRDS: true
  GENERATE_PROD_CERTS: false
  GENERATE_STG_CERTS: false
  CF_DNS_PROVIDER: cloudflare # This demo only supports Cloudflare at the moment
  CF_DOMAIN: [ your-domain.com ] # Has to be an array, even if you only have one domain
  CF_UPDATE_STRATEGY: sync
  CF_EMAIL: your-email@myemail.com
  CF_PROXIED: false
```

The variables that are required to be modified according to your environment at this moment are:

- registryHostname: Add your registry, in this example we are going to be using Docker Hub.
- registryNamespace: Your registry namespace, in Dockerhub this will be your username.
- CF_DOMAIN: Add the DNS you will be using for this project in the form of an array.
- CF_EMAIL: Add the email address that should get notifications from Letsencrypt/Cloudflare.

There is also one secret that we require you to have `exported` at the OS level.

To make secret management easier we use environment variables to provide the Cloudflare API Token. Make sure to have this variable exported as it's used across the project.

````bash
export CF_API_TOKEN="your-cloudflare-api-key"
````

The other variables *should* be set with the values we are providing at this stage as they will configure the project preventing errors to happen, most of them are extra configuration to add another level of customization to this example.

If you followed the steps correctly your `project.garden.yml` should look something like the following example:

```YAML
kind: Project
name: tls-and-dns
defaultEnvironment: prod

environments:
  - name: prod
    production: true
    defaultNamespace: ${var.DEFAULT_NAMESPACE}
    variables:
      base-hostname: ${var.CF_DOMAIN[0]}

providers:
  - name: kubernetes
    environments: [prod]
    context: arn:aws:eks:eu-central-1:431328314483:cluster/cluster-8
    namespace: ${var.DEFAULT_NAMESPACE}
    setupIngressController: nginx
    # tlsCertificates:
    #   - name: staging-cert
    #     secretRef:
    #       name: staging-cert
    deploymentRegistry:
      hostname: "${var.registryHostname}"
      namespace: "${var.registryNamespace}"
    imagePullSecrets:
    - name: regcred
      namespace: default

variables:
  # Variables for Docker Registry
  registryHostname: docker.io
  registryNamespace: shankyweb
  # Variables for Kubernetes
  DEFAULT_NAMESPACE: default
  # Cert-Manager variables
  CERT_MANAGER_INSTALL_CRDS: true
  GENERATE_PROD_CERTS: false
  GENERATE_STG_CERTS: false
  # External-DNS variables
  CF_DNS_PROVIDER: cloudflare
  CF_DOMAIN: [ shankyjs.com ]
  CF_UPDATE_STRATEGY: sync
  CF_EMAIL: hello@shankyjs.com
  CF_PROXIED: false

```

**Note:** Variables are going to be start to make sense after we start building our Helm Modules for `cert-manager` and `external-dns`.

### Creating our Helm Modules 🔨

WIP
