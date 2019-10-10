# cert-manager integration

## Scope, requirements and version supported

### Scope

This guide aims at outlining configuration and best practices when dealing with TLS certificates, cert-manager and Garden.

When starting a new project or when maintaining your existing ones, dealing with the creation and renewal of certificates can easily become a very complex task. Many projects appeared in the last few years to help managing this complexity and one that stood out is [cert-manager](https://github.com/jetstack/cert-manager).

The goal of this integration is to give you a head start when setting the TLS certificates for your project with cert-manager, providing an easy way for installation and some sensible defaults while allowing full control of the underlying configuration.
We don't aim to fully support all the features of cert-manager, but rather accommodate the most common use case while still allowing full control of the underlying setup.

Please read the defaults settings and configurations in each of the following sections.

### Requirements

We require you to have configured your DNS and routing so that the domains you will configure below are pointed to your ingress controller.

### Supported versions

cert-manager is currently under development and will soon go in beta. Currently we only support `cert-manager v0.11.0` which requires `kubernetes >v1.11`.

## Enable the integration and configuration

To enable cert-manager, you'll need to configure it on your Kubernetes Provider configuration in your project `garden.yml` file:

```yaml
    kind: Project
    name: cert-manager-example
    environments:
    - name: remote-dev
      providers:
      - name: kubernetes
        context: your-remote-k8s-cluster-context
        setupIngressController: nginx
        ...
        certManager:
          install: true  # let garden install cert-manager
          email: name@example.com  # your email (used to create Let's Encrypt certificates)
          issuer: acme  # the type of issuer for the certificate generation. This integration supports Let's Encrypt ACME
          acmeChallengeType: HTTP-01  # type of ACME challenge. This integration supports "HTTP-01"
          acmeServer: letsencrypt-staging  # ACME server. "letsencrypt-staging" or "letsencrypt-prod"
        tlsCertificates:
          ...
```

Unless you want to use your own installation of cert-manager, you will need to set the option `install: true`: garden will install cert-manager for you under the `cert-manager` namespace.

If nothing is specified or `install: false` garden will assume to find a valid and running cert-manager installation in the `cert-manager` namespace.

A valid email address is also required if you are planning to generate Certificates through the integrations (we are using a Let's Encrypt HTTP-01 challenge, see below).

## Issuing your first certificate

cert-manager is a very powerful tool with a lot of different possible configurations. While integrating it with Garden we decided to implement some opinionated behaviours which should get you up to speed fast without thinking too much about configuration.
In case you need specific settings or advanced use-cases, you can choose which certificates need to be managed by the integration and which you want to manage yourself by enabling the option `tlsCertificates[].managedBy: cert-manager`.

For advance configuration please take a look at the official [cert-manager documentation](https://docs.cert-manager.io/en/latest/tasks/index.html).

### Example

The configuration for letting Garden create a Certificate through cert-manager happens at the tlsCertificate level. See the [providers[].tlsCertificates[] reference](https://docs.garden.io/reference/providers/kubernetes#providers-tlscertificates) for more details):

```yaml
    kind: Project
    name: cert-manager-example
    environments:
    - name: remote-dev
      providers:
      - name: kubernetes
        context: your-remote-k8s-cluster-context
        ...
        certManager:
          install: true
          email: name@example.com
          issuer: acme
          acmeChallengeType: HTTP-01
          acmeServer: letsencrypt-staging
        tlsCertificates:
          - name: example-certificate-staging-01
            managedBy: cert-manager  # Allow cert-manager to manage this certificate
            serverType: staging  # Let's Encrypt server: "staging" or "prod". Defaults to "prod"
            hostnames:
              - your-domain-name.com # The domain name for the certificate
            secretRef:
              name: tls-secret-for-certificate # The secret where cert-manage will store the TLS certificate once it's generated
              namespace: cert-manager-example
```

The above configuration will trigger the following workflow:

1) cert-manager will create a ClusterIssuer in your cluster which will generate your certificate.
2) It will then create a Certificate resource to request the TLS certificate.
3) Cert-manager will then automatically spin up an nginx ingress to solve the HTTP-01 acmeChallenge.
4) Once the challenge is solved the TLS certificate will be stored as a secret using the name/namespace specified above (eg. `cert-manager-example/tls-secret-for-certificate`)

All the steps above will happen at system startup/init. All your services will be built/tested/deployed after all the secrets have been populated.

### ClusterIssuer vs Issuer

cert-manager have two different Certificate issuers: namespaced and cluster one. Garden will only create ClusterIssuers.

### One certificate per tlsCertificate and one ClusterIssuer per certificate

Garden will create one certificate for each certificate with `managedBy: true` in the `tlsCertificates` array. Each certificate will have an associated ClusterIssuer which will take care of starting and carrying on the challenge and creating the secret containing the TLS certificate once it succeeds.

### Challenge Type

The challenge type currently supported is Let's Encrypt [HTTP-01 challenge](https://letsencrypt.org/docs/challenge-types/).

## Troubleshooting

### Couldn't find a cert-manager installation

If you set `certManager.install: false` garden will expect to find a `cert-manager` installation in the `cert-manager` namespace.
If you already have installed `cert-manager` please verify it's running by checking the status of the main pods as suggested in the [documentation](https://docs.cert-manager.io/en/latest/getting-started/install/kubernetes.html#verifying-the-installation).

At the moment we don't support cert-manager installed in different namespaces.

### The certificate creation timeouts and garden terminates

> Please make sure your domain name is pointing at the right ip address.

The best way to figure out why a certificate is not being generated is using `kubectl describe`.

You can list all the `Certificate` resources with:

```sh
$: kubectl get Certificates -n your-namespace
```

and you can describe the failing Certificate with:

```sh
$: kubectl describe Certificate certificate-name -n your-namespace
```

Please find more info in the ["Issuing an ACME certificate using HTTP validation"](https://docs.cert-manager.io/en/release-0.11/tutorials/acme/http-validation.html#issuing-an-acme-certificate-using-http-validation) guide in the official cert-manager documentation.

---
If have any issue, found a bug or something is not clear in the documentation, please don't hesitate opening a new [Github issue](https://github.com/garden-io/garden/issues/new?template=BUG_REPORT.md) or ask us any question in our [Slack channel](https://chat.garden.io/).
