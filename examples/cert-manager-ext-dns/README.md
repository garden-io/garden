# Deploy cert-manager and ExternalDNS with Garden

Company A is managing a Kubernetes cluster in Google Cloud Platform and using Cloudflare to handle its DNS zone.

In the past, they have provisioned all their DNS records manually, as well as creating and managing their certificates manually. To streamline and automate this process, they have decided to adopt Garden as their automation tool of choice.

To achieve their goal of automating certificate provisioning and renewal, they have decided to deploy cert-manager, a popular Kubernetes add-on that automates the management and issuance of TLS certificates.

Additionally, to enable dynamic DNS provisioning, they have also decided to deploy ExternalDNS, which allows for automatic registration of Kubernetes services and ingress objects into their Cloudflare DNS zone.

By deploying these two tools, Company A will be able to significantly reduce the manual effort required to manage certificates and DNS records, as well as improve the security and reliability of the infrastructure.

## About

This project deploys a small React service in a Kubernetes Cluster and exposes it to an Nginx ingress with HTTPs by using the following Kubernetes Operators:

| service       |   version  |
|---------------|------------|
| cert-manager  |  v1.11.0   |
| external-dns  |   v6.13.3  |

By using a combination of `container` and `helm` modules supported by Garden and with minimal manual intervention, we are able to rapidly deploy and provision our cluster with everything it needs for automatic TLS and DNS.

### Folder structure

In the following block you will find the structure that we followed for this cert-manager-ext-dns example.

````bash
├── charts
│   ├── cluster-issuers <- Creates cluster-issuers certificate.
├── frontend <- Deploys a React Application to the environment
│   ├── Dockerfile
│   ├── garden.yml
│   ├── node_modules
│   ├── package.json
│   ├── package-lock.json
│   ├── public
│   └── src
├── garden.yml <- Contains the module config for external-dns & cert-manager
├── project.garden.yml <- Contains the project configuration/env-vars.
└── README.md
````

## Instructions

This project is part of a tutorial hosted in our docs called [Set Up Ingress, TLS and DNS](https://docs.garden.io/kubernetes-plugins/remote-k8s/ingress-and-dns).

In order to get step-by-step instructions feel free to go to that document, and use this resource if you need to compare your code while you run the project.
