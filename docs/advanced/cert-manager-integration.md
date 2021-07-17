# cert-manager Integration

When starting a new Kubernetes project or when maintaining your existing ones, dealing with the creation and renewal of TLS certificates can easily become a headache. A popular tool to help automate certficate generation and renewal is [cert-manager](https://github.com/jetstack/cert-manager).

The [kubernetes](../guides/remote-kubernetes.md) and [local-kubernetes](../guides/local-kubernetes.md) providers include an integration with cert-manager. The goal of the integration is to give you a head start when setting up TLS certificates for your project, providing an easy way to install it, and some sensible defaults.
We don't aim to support all the features of cert-manager, but rather accommodate the most common use case, while still allowing full control of the underlying setup when needed.

## Requirements

You need to have an ingress controller configured, that is configured using Ingress resources (e.g. nginx). You can install nginx automatically by setting `setupIngressController: nginx` in your `kubernetes` provider config.
You also need make sure your DNS and routing are configured to point the domains you will configure below to your ingress controller.

## Limitations

cert-manager is currently under development. Currently we only support cert-manager v0.11.0, which requires Kubernetes v1.11 or higher.

If you set `certManager.install: false` garden will expect to find a `cert-manager` installation in the `cert-manager` namespace.
If you already have installed `cert-manager` please verify it's running by checking the status of the main pods as suggested in the [documentation](https://docs.cert-manager.io/en/latest/getting-started/install/kubernetes.html#verifying-the-installation).

The integration currently only supports Let's Encrypt and HTTP-01 challenges. We also only support cert-manager ClusterIssuers and not namespace Issuers.

> More configuration options will be implemented, but we need your help to prioritize them! Please [file an issue](https://github.com/garden-io/garden/issues) to request the features you need.

## Usage

### Enabling and configuring cert-manager

To enable cert-manager, you'll need to configure it in the `kubernetes` provider configuration in your project `garden.yml` file:

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
          email: name@example.com  # your email (required when requesting Let's Encrypt certificates)
          issuer: acme  # the type of issuer for the certificate generation (currently only Let's Encrypt ACME is supported)
          acmeChallengeType: HTTP-01  # type of ACME challenge (currently only "HTTP-01" is supported)
          acmeServer: letsencrypt-staging  # the ACME server to use ("letsencrypt-staging" or "letsencrypt-prod")
        tlsCertificates:
          ...
```

Unless you want to use your own installation of cert-manager, you will need to set the option `install: true`. Garden will then install cert-manager for you under the `cert-manager` namespace.

> Note: Garden will wait until all the pods required by cert-manager will be up and running. This might take more than 2 minutes depending on the cluster.

If nothing is specified or `install: false`, Garden will assume you already have a valid and running cert-manager installation in the `cert-manager` namespace.

A valid email address is also required for Let's Encrypt certificate requests.

### Issuing your first certificate

cert-manager is a powerful tool with a lot of different possible configurations. While integrating it with Garden we decided to start with an opinionated setup which should get you up to speed quickly, without thinking too much about configuration.
If/when you need specific settings or advanced use-cases, you can choose which certificates need to be managed by the integration and which you want to manage yourself using the [`tlsCertificates[].managedBy` config field](../reference/providers/kubernetes.md#providerstlscertificatesmanagedby).

#### Example

When you set `managedBy: cert-manager` on a certificate specified in the `tlsCertificates` field, Garden creates a corresponding Certificate resource:

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
            managedBy: cert-manager  # allow cert-manager to manage this certificate
            hostnames:
              - your-domain-name.com # the domain name(s) to be covered by the certificate
            secretRef:
              name: tls-secret-for-certificate # the secret where cert-manager will store the TLS certificate once it's generated
```

The above configuration will trigger the following workflow:

1. cert-manager will create a ClusterIssuer in your cluster which will generate your certificate. Each certificate gets an associated ClusterIssuer, which will take care of performing the issue challenge.
2. Garden will then create a Certificate resource to request the TLS certificate.
3. cert-manager will then automatically create an Ingress to solve the HTTP-01 ACME challenge.
4. Once the challenge is solved the TLS certificate will be stored as a Secret using the name/namespace specified above (e.g. `<your-app-namespace>/tls-secret-for-certificate`).

All the steps above will happen at system startup/init. All your services will be built/tested/deployed after all the secrets have been populated.

For advanced configuration, please take a look at the official [cert-manager documentation](https://docs.cert-manager.io/en/latest/tasks/index.html).

## Troubleshooting

### The certificate creation timeouts and garden terminates

> Please make sure your domain name is pointing at the right IP address.

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

If have any issue, find a bug, or something is not clear from the documentation, please don't hesitate opening a new [GitHub issue](https://github.com/garden-io/garden/issues/new?template=BUG_REPORT.md) or ask us questions in our [Slack channel](https://chat.garden.io/).
