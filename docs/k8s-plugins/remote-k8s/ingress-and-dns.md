---
title: 3. Set Up Ingress, TLS and DNS
order: 3
---

# 3. Set Up Ingress, TLS and DNS

## Setting up Ingress

By default, Garden will not install an ingress controller for remote environments. This can be toggled by setting the [`setupIngressController` flag](../../reference/providers/kubernetes.md#providerssetupingresscontroller) to `nginx`. Alternatively, you can set up your own ingress controller, e.g. using [Traefik](https://traefik.io/), [Ambassador](https://www.getambassador.io/) or [Istio](https://istio.io/). You can find an example for [using Garden with Istio](https://github.com/garden-io/garden/tree/0.12.53/examples/istio) in our [examples directory](https://github.com/garden-io/garden/tree/0.12.53/examples).

## Setting up TLS and DNS

There are multiple options available for SSL implementation with Garden, this section will walk you through different approaches to configure ingress, DNS and manage TLS with Garden.

### Configuring DNS

After setting up the Ingress Controller you will need to point one or more DNS entries to your cluster, and configure a TLS certificate for the hostnames you will expose for ingress.

Templating the ingress to the application enables you to have DNS entries for every developer's namespace.

First, you will make DNS CNAME entry that points to the load balancer in front of your cluster. We recommend setting a wildcard in front of the proper record, e.g. *.<environment>.<your company>.com.

### Configuring TLS

#### Recommended approach (Using Cloud Provider's Solution)

To manage TLS for development environments, we recommend using your cloud provider's certificate management service in combination with a load balancer. Find the documentation for [AWS here](https://aws.amazon.com/premiumsupport/knowledge-center/associate-acm-certificate-alb-nlb/) and for [GCP here](https://cloud.google.com/load-balancing/docs/ssl-certificates/google-managed-certs).

#### Manually created Certificates

If you are manually creating or obtaining the certificates (and you have the `.crt` and `.key` files), create a
[Secret](https://kubernetes.io/docs/concepts/configuration/secret/) for each cert in the cluster so
they can be referenced when deploying services:

```sh
kubectl create secret tls mydomain-tls-secret --key <path-to-key-file> --cert <path-to-crt-file>
```

Once you have completed the set up, make note of the hostname.

If you're storing certs as Kubernetes Secrets, also make note of their names and namespaces.

Refer your TLS certificate in your Garden Provider configuration:

````yaml
providers:
  - name: kubernetes
    environments: [dev]
    tlsCertificates:
      - name: mydomain-tls-secret
        secretRef:
            name: mydomain-tls-secret
````

## Additional Resources

### Cert-manager and ExternalDNS example

If you have not been utilizing certificates from your own cloud service provider, you may find our guide on [integrating cert-manager and externalDNS](https://docs.garden.io/advanced/cert-manager-integration) to be of value. This tutorial offers a methodical, step-by-step approach for generating and managing certificates using these tools in conjunction with Garden.
