---
title: 3. Set Up Ingress, TLS and DNS
order: 3
---

# 3. Set Up Ingress, TLS and DNS

By default, Garden will not install an ingress controller for remote environments. This can be toggled by setting the [`setupIngressController` flag](../../reference/providers/kubernetes.md#providerssetupingresscontroller) to `nginx`. Alternatively, you can set up your own ingress controller, e.g. using [Traefik](https://traefik.io/), [Ambassador](https://www.getambassador.io/) or [Istio](https://istio.io/). You can find an example for [using Garden with Istio](https://github.com/garden-io/garden/tree/0.14.8/examples/istio) in our [examples directory](https://github.com/garden-io/garden/tree/0.14.8/examples).

You'll also need to point one or more DNS entries to your cluster, and configure a TLS certificate for the hostnames
you will expose for ingress.

Templating the ingress to the application enables you to have DNS entries for every developer's namespace.

First, you will make DNS CNAME entry that points to the load balancer in front of your cluster. We recommend setting a wildcard in front of the proper record, e.g. *.<environment>.<your company>.com.

If you would like to manage TLS for development environments, we recommend using your cloud provider's certificate management service in combination with a load balancer. You can find the documentation for [AWS here](https://aws.amazon.com/premiumsupport/knowledge-center/associate-acm-certificate-alb-nlb/) and for [GCP here](https://cloud.google.com/load-balancing/docs/ssl-certificates/google-managed-certs).

If you are manually creating or obtaining the certificates (and you have the `.crt` and `.key` files), create a
[Secret](https://kubernetes.io/docs/concepts/configuration/secret/) for each cert in the cluster so
they can be referenced when deploying services:

```sh
kubectl create secret tls mydomain-tls-secret --key <path-to-key-file> --cert <path-to-crt-file>
```

Once you have completed the set up, make note of
hostname.

If you're storing certs as Kubernetes Secrets, also make note of their names and namespaces.

