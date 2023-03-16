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

To execute this scenario successfully we assume the following:

1. A Kubernetes cluster with the correct Security Groups/Firewall rules to allow HTTP/HTTPs.
2. A domain name that you own (e.g. example.com). This domain name can be purchased anywhere but we expect for this example that Cloudflare is at least your [primary DNS provider](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup).
3. An account in Cloudflare with at least 1 DNS hosted zone.
   - You will also need a Cloudflare API Token with the permissions defined [here](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/cloudflare.md#creating-cloudflare-credentials)
4. Some prior knowledge in [cert-manager](https://cert-manager.io/docs/) and [ExternalDNS](https://github.com/kubernetes-sigs/external-dns) and their use cases.

## Setup

This project requires some configuration of environment variables to work properly. We will go through each of them and explain their purpose.

## Exporting necessary environment variables and secrets

To make secret management easier we use environment variables to provide the Cloudflare API Token. Make sure to have this variable exported as it's used across the project.

````bash
export CF_API_TOKEN="your-cloudflare-api-key"
````

Make sure to modify `project.garden.yml` and add the necessary environment variables to match your environment configuration.

Comments are provided for each variable to explain its purpose.

![Environment variable placeholders](https://res.cloudinary.com/djp21wtxm/image/upload/v1676710972/i1600x362-nCHxEHiCwX2L_yzdcm9.png)

### Example of configuration

⚠️ It is recommended to run this project for the first time with GENERATE_PROD_CERTS to false. If set to true, Let's Encrypt production API endpoint is used that has strict policies/API rates and could result in long delays if certificates are configured incorrectly.

Enable it after you have confirmed your configuration is valid by using the Staging Let's Encrypt API endpoint first .

![Environment variable example comments](https://res.cloudinary.com/djp21wtxm/image/upload/v1676711252/i1600x342-qBL-bNbNlj22_avct6f.png)

⚠️ Update line 19 in the same file to specify the correct context.

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

After a couple of minutes you should be able to see your environment was deployed successfully.

![Successful deployment message](https://res.cloudinary.com/djp21wtxm/image/upload/v1676712270/i1563x1137-YBwTDWQW1SRN_jvtug7.png)

`external-dns` will create 2 DNS records: 1 for the React service and and 1 wildcard (`*.DOMAINNAME`) that will help cert-manager to authenticate the ownership of our domain and be able to generate the certificate.

![DNS records in Cloudflare dashboard](https://res.cloudinary.com/djp21wtxm/image/upload/v1676713413/i1600x105-9w7fM9ZAJjwR_wqzhmx.png)

If you check your certificates with `kubectl get cert`, there should be a new certificate for staging (because we deployed with `GENERATE_PROD_CERTS=false`)

![Staging certificate](https://res.cloudinary.com/djp21wtxm/image/upload/v1676712336/i1167x182-iL4-rXCneopO_ubbzy2.png)

Once validated, proceed to generating a production certificate.

![Production certificate](https://res.cloudinary.com/djp21wtxm/image/upload/v1676712383/i496x238-6njMxQwTOKhk_bwy5gd.png)

Re-deploy with

````bash
garden deploy --env=prod --yes
````

Now your certificate should be available in your cluster. You may need to wait a few minutes because for the `production` Let's Encrypt endpoint to provision your certificate.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676712552/i1225x174-snbD3cVmy3OD_ihlmqr.png" alt="" />

## Using Certificates in your ingress

You should now have a service running at the following DNS `react.${your-domain-termination}` insecurely (HTTP).

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676712587/i1600x744-DlhjPIr3f0XI_aut50k.png" alt="" />

### Staging Certificates

We recommend testing with only staging certificates because of the limits/rates from Let's Encrypt in the production certificate generation. Use production first at your own risk (you might get quota exceeded if you generate too much certificates in a short span of time.)

Now let's uncomment from line 23 to line 26 in your `project.garden.yml`, as you can see it has the staging-certificates configured by default.

![Visually Impaired](https://res.cloudinary.com/djp21wtxm/image/upload/v1676834801/i1600x278-0Fs34Dn9YD9e_nkq43p.png "Something")

After uncommenting those lines, deploy again one more time to prod.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676834871/i1600x1155-WiQ-YkbY1Dwk_ntwqlg.png" alt="" />

If you access your site now you will receive the message: "connection not private". If you click "Advanced" in your web browser and then proceed to `react.${your-domain-termination}`" you will be able to view your fancy Hello Garden🌸 landing page using the staging Let's Encrypt certificate.

1.
<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676834933/i1425x1036-pyYqS8azWa2P_ccsaez.png" alt="" />

2.
<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676835016/i1600x1085-R-nlUNxT6bML_eangbo.png" alt="" />

This is great! This means that our certificate is being correctly used by our Ingress Controller and we are able to proceed with the Production certificate for a valid, secured, HTTPS endpoint 🕺.

## Production Certificates

When you are confident with your configuration, let's run production using our prod certificates.

In your project.garden.yml file replace the word `staging` with `production` under `tlsCertificates` in your `project.garden.yml` file.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676835286/i786x426-00AM-rF4sJK1_jrhh0y.png" alt="" />

⚠️ Please make sure that your Production certificate is valid and ready by using `kubectl get certificates` and checking the status of your certificate.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676835440/i1209x154-Ni_gOnEl4tFf_nfwapg.png" alt="" />

If your certificate is not in `Ready` status, you will need to debug why the generation is not being successful. View the cert-manager [troubleshooting docs](https://cert-manager.io/docs/troubleshooting/acme/) for some common cert-manager issues/misconfigurations.

Now, deploy just one more time!🌟

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676835555/i1600x1061-hRr4IgzCHubH_o7klyc.png" alt="" />

Annnnnd **voilà**! we can see the desired 🔒️ in our website, if you got into this point this means the demo worked perfectly for you.

<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676835652/i1600x904-LLQLXx-TtGww_va4xkf.png" alt="" />

# Conclusions

- We adopted Garden as our automation tool of choice to streamline and automate our manual processes.
- We deployed cert-manager and external-dns Kubernetes Helm charts to automate the management and issuance of TLS certificates and enable dynamic DNS provisioning.
- By deploying these two tools, we have significantly reduced manual effort and improved the security and reliability of their infrastructure.
- The project structure, prerequisites, setup, and usage were explained in detail in this post.
- With Garden and Helm charts, it is possible to automate and simplify complex processes and improve efficiency when managing infrastructure.

## Common errors

- If you get an error saying `Cannot find Secret production-cert-wildcard` or `... staging-cert-wildcard`.
<img src="https://res.cloudinary.com/djp21wtxm/image/upload/v1676838717/i1600x1008-2liOMXuT3a87_rajfex.png" alt="" />
  - Make sure you deployed your frontend service to the `default` namespace, to make things easier for us we deployed the service there as the secrets live there.
- Your certificates might not be ready or deployed, you can deploy only the prerequisites by using the following command: `garden deploy --env=prod external-dns,cert-manager,cluster-issuers --yes`
  - After checking that your certificate is available and you are deploying your service to the default namespace you can trigger a deployment again to resolve with `garden deploy --env=prod --yes`.
