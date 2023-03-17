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
   - You will also need a Cloudflare API Token with the permissions defined [in this example.](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/cloudflare.md#creating-cloudflare-credentials)
   - 🚨 Make sure that you are using an API Token, not an API Key (or Global Key) as this example is using the API Token specifically.
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

Now we are going to start setting up the [Helm modules](https://docs.garden.io/reference/module-types/helm) that are going to be in charge of deploying our Helm Charts to our Kubernetes Cluster.

#### Configuring Cert-Manager module

Let's edit our `./garden.yml` file, and paste the following content, which handles the installation of the `cert-manager` operator, who is going to be in charge of creating/renewing our certificates.

For this Helm Chart we only require 1 value called `installCRDs` that is in charge of installing the [Custom Resource Definitions](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) in our Kubernetes Cluster.

Also, something to note is that we are starting to use the environment variables that we set previously at the `garden.project.yml` level.

````yaml
---
# Cert-Manager Helm Chart configuration
kind: Module
type: helm
name: cert-manager
namespace: cert-manager
description: This module installs cert-manager in our Kubernetes Cluster.
repo: https://charts.jetstack.io
chart: "cert-manager"
version: v1.11.0
chartPath: .
values:
  installCRDs: ${var.CERT_MANAGER_INSTALL_CRDS}
---
````

#### Configuring ExternalDNS module ☁️

External-DNS is the operator who is going to be in charge of creating our DNS entries into our CloudFlare account in an automated way.

The combination of ExternalDNS + Cert-Manager is a powerful and production ready solution to manage and deploy certificates. 🚀

Add the following to your `garden.yml`:

````yaml
# External-DNS Helm Chart
kind: Module
type: helm
name: external-dns
namespace: external-dns
description: This module installs external-dns in our Kubernetes Cluster.
repo: https://charts.bitnami.com/bitnami
chart: "external-dns"
version: 6.13.3
chartPath: .
values:
  provider: ${var.CF_DNS_PROVIDER}
  domainFilters: ${var.CF_DOMAIN}
  policy: ${var.CF_UPDATE_STRATEGY}
  cloudflare:
    email: ${var.CF_EMAIL}
    proxied: ${var.CF_PROXIED}
    apiToken: ${local.env.CF_API_TOKEN}
````

This module requires more variables/configuration because the Helm Chart is more complex as it needs the correct Zone Details and values in order to be configured correctly, for a full list of the possible values you can set see the [Helm Chart documentation](https://artifacthub.io/packages/helm/bitnami/external-dns).

#### Configuring cluster-issuers module

This Helm module is going to be different than the others we previously configured, because this Helm chart is intended to deploy the Custom Resources that we are going to need in order to interact with this demo, and the Helm Chart is going to be living in the same repository we are executing this demo.

At this point we are just going to add the configuration of the Helm Module for Garden, we will create the chart in the next section of this tutorial.

Add the following content to your `./garden.yml` file:

````yaml
---
# Cluster-issuers module configuration
kind: Module
type: helm
name: cluster-issuers
namespace: default
description: This module installs cluster-issuers in our Kubernetes Cluster.
chartPath: charts/cluster-issuers
dependencies:
  - cert-manager # This module depends on the cert-manager module (we need the CRDs to be installed)
values:
  cloudflare:
    email: ${var.CF_EMAIL}
    apiToken: ${local.env.CF_API_TOKEN}
    cfDomain: ${var.CF_DOMAIN[0]} # For this example, at the moment we only support one domain.
  generateStgCert: ${var.GENERATE_STG_CERTS}
  generateProdCert: ${var.GENERATE_PROD_CERTS}
````

#### Validating our garden.yml file ✅

If you followed through this section your `garden.yml` file should have the following content:

````yaml
---
# Cert-Manager Helm Chart configuration
kind: Module
type: helm
name: cert-manager
namespace: cert-manager
description: This module installs cert-manager in our Kubernetes Cluster.
repo: https://charts.jetstack.io
chart: "cert-manager"
version: v1.11.0
chartPath: .
values:
  installCRDs: ${var.CERT_MANAGER_INSTALL_CRDS}
---
# External-DNS Helm Chart
kind: Module
type: helm
name: external-dns
namespace: external-dns
description: This module installs external-dns in our Kubernetes Cluster.
repo: https://charts.bitnami.com/bitnami
chart: "external-dns"
version: 6.13.3
chartPath: .
values: # To check a full list of values, see https://artifacthub.io/packages/helm/bitnami/external-dns
  provider: ${var.CF_DNS_PROVIDER}
  domainFilters: ${var.CF_DOMAIN}
  policy: ${var.CF_UPDATE_STRATEGY}
  cloudflare:
    email: ${var.CF_EMAIL}
    proxied: ${var.CF_PROXIED}
    apiToken: ${local.env.CF_API_TOKEN}
---
# Cluster-issuers module configuration
kind: Module
type: helm
name: cluster-issuers
namespace: default
description: This module installs cluster-issuers in our Kubernetes Cluster.
chartPath: charts/cluster-issuers
dependencies:
  - cert-manager # This module depends on the cert-manager module (we need the CRDs to be installed)
values:
  cloudflare:
    email: ${var.CF_EMAIL}
    apiToken: ${local.env.CF_API_TOKEN}
    cfDomain: ${var.CF_DOMAIN[0]} # For this example, at the moment we only support one domain.
  generateStgCert: ${var.GENERATE_STG_CERTS}
  generateProdCert: ${var.GENERATE_PROD_CERTS}

````

Make sure to review if your file matches this and correct if it's needed.

### Creating the cluster-issuers Helm Chart

This chart is a custom Helm Chart that will create the following resources:

- ClusterIssuers: A Cluster issuer is in charge of identifying which Certificate Authority (CA) cert-manager will use to issue a certificate.
- Certificates: Represents a human readable definition of a certificate request that is created by an issuer. In order to generate a certificate you need a ClusterIssuer or an Issuer first.
- Cloudflare-API-Token Secret: This Kubernetes secret is going to be used so `cert-manager` can do the DNS01 challenge using the CloudFlare API Token.

In previous steps we created the Folder structure that we were going to use for this Helm Chart, however we didn't created the files, so let's start with that.

````bash
# Creating the Templates (Kubernetes Manifests)
mkdir ./charts/cluster-issuers/templates
touch ./charts/cluster-issuers/templates/certificates.yaml
touch ./charts/cluster-issuers/templates/cluster-issuers.yaml
touch ./charts/cluster-issuers/templates/secret.yaml
# Create main values files and Chart file
touch ./charts/cluster-issuers/Chart.yaml
touch ./charts/cluster-issuers/.helmignore
touch ./charts/cluster-issuers/values.yaml
````

Your chart structure should look like the following:

````bash
./charts
└── cluster-issuers
    ├── Chart.yaml
    ├── templates
    │   ├── certificates.yaml
    │   ├── cluster-issuers.yaml
    │   └── secret.yaml
    └── values.yaml
````

#### Chart.yaml

The Chart.yaml file is the metadata for our Helm Chart, the content of this file is used to identify each Helm Chart.

Add the following content to your Chart.yaml

````yaml
apiVersion: v2
name: cluster-issuers
description: A Helm chart for needed resources for TLS and DNS
type: application
version: 0.1.0
maintainers:
- name: ShankyJS
  email: your-email@email.com

````

#### values.yaml

The values.yaml file is used to provide default values for our Helm Chart, usually you can leave some values by default but in this case we will need to make sure to override all of them. (The override happens at the Helm Chart Garden Module level).

Add the following content to your values.yaml

````yaml
cloudflare:
  email: default@letsencrypt.com
  apiToken: replace-me # Cloudflare API Token
  cfDomain: replace-me.com # Cloudflare Domain

generateStgCert: false
generateProdCert: false
````

#### cluster-issuers.yaml

This file will have the ClusterIssuers that we are going to use in this demo.

There are two servers that allow you to generate certificates with cert-manager.

- staging-letsencrypt: `https://acme-staging-v02.api.letsencrypt.org/directory`
- production-letsencrypt: `https://acme-v02.api.letsencrypt.org/directory`

⚠️ Across this tutorial, we recommend testing with only staging certificates because the limits/rates from Let's Encrypt in the production CA are really low, so creating multiple certificates from the same DNS could have negative effects (as you can hit quotas and get blocked for weeks).

Only generate production certificates after you are sure that your configuration is correct (After testing a couple of times with the staging CA).

Add the following content to your cluster-issuers.yaml file:

````yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: {{ .Values.cloudflare.email }}
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging
    solvers:
    - dns01:
         cloudflare:
           email: {{ .Values.cloudflare.email }}
           apiTokenSecretRef:
             name: cloudflare-api-token-secret
             key: api-token
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-production
spec:
  acme:
    email: {{ .Values.cloudflare.email }}
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-production
    solvers:
    - dns01:
         cloudflare:
           email: {{ .Values.cloudflare.email }}
           apiTokenSecretRef:
             name: cloudflare-api-token-secret
             key: api-token

````

#### certificates.yaml

This file contains the certificates that are going to be generated with cert-manager.

As you can see we are just generating certificates for the `react` subdomain. If you will have multiple applications with certificates you'll need to modify this Helm Chart to be able to generate N certificates on demand.

As this is only an example we decided to move forward with a single Frontend with a single certificate.

Note that the Certificates are `feature-flagged` this means that in order to create this certificates first you will need to enable the environment variable `generateStgCert` or `generateProdCert` in your `project.garden.yml` file.

````yaml
{{ if .Values.generateStgCert }}
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: staging-cert
spec:
  dnsNames:
  - "react.{{ .Values.cloudflare.cfDomain }}"
  issuerRef:
    name: letsencrypt-staging
    kind: ClusterIssuer
  secretName: staging-cert
{{ end }}
---
{{ if .Values.generateProdCert }}
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: production-cert
spec:
  dnsNames:
  - "react.{{ .Values.cloudflare.cfDomain }}"
  issuerRef:
    name: letsencrypt-production
    kind: ClusterIssuer
  secretName: production-cert
{{ end }}

````

#### secret.yaml

This file will contain a secret that it's going to be filled with our environment variable `CF_API_TOKEN`, we need this token as cert-manager uses it to prove that we own the domain we are using to issue certificates.

Add the following content to your secret.yaml

````yaml
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-api-token-secret
  namespace: cert-manager
type: Opaque
stringData:
  api-token: {{ .Values.cloudflare.apiToken }}

````

After creating our files, our Helm Chart is now ready to be deployed with Garden. 🪴

### Creating our Frontend

To showcase our certificates we decided to use a sample react-application, the code for that React Application is hosted in this [repository](https://github.com/ShankyJS/garden-cra-demo).

You can simply clone that repository; and move the code to the folder called `frontend` in your example.

#### Cloning the existing repo

The following commands needs to be executed from your root (next to where the `project.garden.yml` file is.)

````bash
git clone git@github.com:ShankyJS/garden-cra-demo.git
mv -f garden-cra-demo frontend
````

This folder has the `garden.yml` and `Dockerfile` ready, so you are ready to go to the next step.

Just to document what it's the content of the `garden.yml` to configure our React App, we are going to use the following configuration, the most important part in this configuration is the ingresses block, as it's where we are setting the hostname for the application `Ex. react.shankyjs.com`.

````yaml
kind: Module
type: container
name: react-app
description: React App for TLS and DNS example
build:
  dependencies:
    - name: cluster-issuers
services:
  - name: frontend
    dependencies: [cluster-issuers]
    ports:
      - name: http
        containerPort: 3000
    ingresses:
      - path: /
        port: http
        hostname: react.${var.base-hostname}
    devMode: # This is the dev mode for the module, make sure to run it with `garden deploy --dev-mode --watch`
      command: [npm, start]
      sync:
        - source: ./src
          target: /app/src
          exclude: [node_modules]
        - source: package.json
          target: /package.json
tests:
  - name: unit
    args: ["npm", "test"]

````

### Recap

To this point we have successfully created and configured the whole Garden project and we are ready to start deploying it 🚀.

## Deploy

Now we are ready to deploy our `garden project` for the first time,

First of all, we need to deploy the necessary plugins in our cluster that will allow Garden to run successfully.

````bash
garden plugins kubernetes cluster-init
````

````bash
garden plugins kubernetes cluster-init
Plugins ⚙️


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍  Running in namespace default in environment prod
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Initializing/updating cluster-wide services for prod environment ⚙️

ℹ providers                 → Getting status...
ℹ providers                 → Getting status...
✔ providers                 → Getting status... → Done
ℹ graph                     → Resolving 11 modules...
✔ graph                     → Resolving 11 modules... → Done
✔ providers                 → Getting status... → Done

ℹ providers                 → Getting status...
✔ providers                 → Getting status... → Cached
ℹ providers                 → Run with --force-refresh to force a refresh of provider statuses.
ℹ graph                     → Resolving 11 modules...
✔ graph                     → Resolving 11 modules... → Done
All services already initialized!
Cleaning up old resources...

Done!
````

After creating the plugins, make sure that you have the following variables configured in your `project.garden.yml` file.

````yaml
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
  CF_EMAIL: jhan.silva@icloud.com
  CF_PROXIED: false

````

This means that in the first run we are not going to generate certificates, by doing this we should give enough time to `external-dns` so it can create the DNS for us.

Now we can deploy for the first time 🎉

````bash
garden deploy --yes
````

This should give us the following result:


### WIP

Need to re-run the project in order to replace the images with actual text/logs.

