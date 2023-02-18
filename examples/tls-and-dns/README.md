# Scenario

Company A is managing a Kubernetes cluster in GCP and using CloudFlare to handle its DNS zone.

In the past, they have been provisioning all their DNS records manually, as well as creating and managing their certificates manually. To streamline and automate this process, they have decided to adopt Garden as their automation tool of choice.

To achieve their goal of automating certificate provisioning and renewal, they have decided to deploy cert-manager, a popular Kubernetes add-on that automates the management and issuance of TLS certificates.

Additionally, to enable dynamic DNS provisioning, they have also decided to deploy external-dns, which allows for automatic registration of Kubernetes services and ingress objects into their CloudFlare DNS zone.

By deploying these two tools, Company A will be able to significantly reduce the manual effort required to manage certificates and DNS records, as well as improve the security and reliability of the infrastructure.

## About

This project deploys an small create-react-app application in a Kubernetes Cluster and exposes it to an Nginx ingress with HTTPs by using the following Kubernetes Operators:

| service 	    |   version 	    |
|---------------|---------------	|
| cert-manager	|  v1.11.0      	| 
| external-dns  |   v6.13.3       |

We were able to run this by using a combination of `container` and `helm` module within Garden.io and with minimal manual intervention.

### Folder structure

In the following block you will find the structure that we followed for this tls-and-dns example.

````bash
├── charts
│   ├── cluster-issuers <- Creates cluster-issuers/wild-card certificate.
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

## Prerequisites
To execute this scenario successfully we assume that you might have already setup the following:
1. A Kubernetes Cluster with the correct Security Groups/Firewall rules to allow HTTP/HTTPs.
2. An account in CloudFlare with at least 1 DNS hosted zone.
   - You will also need a CloudFlare API Token with the permissions defined [here](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/cloudflare.md#creating-cloudflare-credentials)
3. Some prior knowledge in [cert-manager](https://cert-manager.io/docs/) and [external-dns](https://github.com/kubernetes-sigs/external-dns) and their use cases.


# Setup
After making sure that the prerequisites are fulfilled we can proceed with the execution of the project.

This project requires some configuration in environment variables to make use of the Garden Configuration and be able to deploy this demo successfully.

## Exporting necessary env-vars/secrets

To make secret-management easier we decided to use environment variables to fill the CloudFlare API Token. Make sure to have this variable exported as it's used across the project.

````bash
export CF_API_TOKEN="your-cloudflare-api-key"
````

Make sure to modify ./project.garden.yml and add the necessary environment variables to match your environment configuration.

You will find some comments in each variable to explain the need of it.
<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676710972/i1600x362-nCHxEHiCwX2L_yzdcm9.png" alt="" />

### Example of configuration

<i>Note: I would recommend running this project for the first time with GENERATE_PROD_CERTS to false as it will use Production Letsencrypt that has strict policies/API rates.</i>

Only enable it after you already now that your configuration is valid by using the Staging Letsencrypt first.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676711252/i1600x342-qBL-bNbNlj22_avct6f.png" alt="" />

<i>Also make sure to update line 19 in the same file to specify the correct context.</i> 
````yaml
    context: garden-dns-tls-test # Make sure to change this to your own context
````

## Usage

We will need to initialize the prerequisites for Garden. In this project we are using `Kaniko` and `Nginx` so we need to make sure to install them with the following command:

````bash
garden --env=prod plugins kubernetes cluster-init
````

Now we can proceed with deploying for the first time ever 🎉

````bash
garden deploy --env=prod --yes
````

After 2-3 minutes you should be able to see your environment was deployed successfully.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676712270/i1563x1137-YBwTDWQW1SRN_jvtug7.png" alt="" />

If you check your certificates, there should be a new certificate for staging (because we deployed with `GENERATE_PROD_CERTS=false`

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676712336/i1167x182-iL4-rXCneopO_ubbzy2.png" alt="" />

Now that we validated that our configuration is indeed correct we can proceed to enable Production Certificate.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676712383/i496x238-6njMxQwTOKhk_bwy5gd.png" alt="" />

And then re-deploy with

````bash
garden deploy --env=prod --yes
````

Now your certificate should be available in your cluster. You will need to wait a couple of minutes because this is the `production` LetsEncrypt, at this moment cert-manager is executing the challenges/orders and validations to generate your wildcard certificate.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676712552/i1225x174-snbD3cVmy3OD_ihlmqr.png" alt="" />

# Using Certificates in your ingress

Pending