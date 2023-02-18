# cluster-issuers helm chart

This custom Helm Chart will generate the following resources:

- ClusterIssuers: The `ClusterIssuer` determines the Certificate Authority (CA). This CA gets used by cert-manager to issue certificates.
- Certificates: A certificate is a readable definition of a cert request created by an issuer. Which can be either a Cluster Issuer or an Issuer.
- Kubernetes Secret: cert-manager uses this secret to execute the challenge using the Cloudflare API token.

The chart structure is the following:

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

## Chart.yaml

The Chart.yaml file is the metadata for our Helm Chart. The purpose of this file is to identify each Helm chart and use it with the `helm` binary.

## values.yaml

The purpose of the values.yaml file is to set default values for our Helm chart.

These are all the values required to use this Helm chart.

````yaml
cloudflare:
  email: default@letsencrypt.com
  apiToken: replace-me # Cloudflare API Token
  cfDomain: replace-me.com # Cloudflare Domain

generateStgCert: false
generateProdCert: false
````

## cluster-issuers.yaml

This file contains the ClusterIssuers used in this demo. There are two servers available to generate certificates with cert-manager:

- staging-letsencrypt: `https://acme-staging-v02.api.letsencrypt.org/directory`
- production-letsencrypt: `https://acme-v02.api.letsencrypt.org/directory`

Testing with staging certificates is recommended. Production CA limits/rates are low, and creating multiple certificates from the same DNS can result in negative effects, such as hitting quotas and being blocked for weeks.

Only generate production certificates after testing with the staging CA.

## certificates.yaml

This file contains the certificates cert-manager will create. As shown, we are only generating certificates for the react subdomain. If you require certificates for multiple applications, modify this Helm Chart to generate multiple certificates.

Note that the Certificates are feature-flagged. To create these certificates, you must first enable the generateStgCert or generateProdCert environment variable in your project.garden.yml file.

## secret.yaml

This secret contains the `CF_API_TOKEN` that cert-manager uses to verify the ownership of the DNS used to create the certificates.
