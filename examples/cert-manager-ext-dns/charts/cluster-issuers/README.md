# cluste-issuers helm chart

This chart is a custom Helm Chart that will create the following resources:

- ClusterIssuers: A Cluster issuer is in charge of identifying which Certificate Authority (CA) cert-manager will use to issue a certificate.
- Certificates: Represents a human readable definition of a certificate request that is created by an issuer. In order to generate a certificate you need a ClusterIssuer or an Issuer first.
- Cloudflare-API-Token Secret: This Kubernetes secret is going to be used so `cert-manager` can do the DNS01 challenge using the CloudFlare API Token.

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

## values.yaml

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

## cluster-issuers.yaml

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

## certificates.yaml

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

## secret.yaml

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

With this files ready, our Helm Chart is now available to be deployed with Garden. 🪴
