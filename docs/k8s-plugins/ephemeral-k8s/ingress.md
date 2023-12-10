---
title: 3. Configure Ingress (optional)
order: 3
---

# 3. Configure Ingress (optional)

Ephemeral Kubernetes Clusters fully support ingresses and each cluster is assigned its own unique default hostname dynamically when created. This hostname and its direct subdomains are secured by TLS and require authentication.
Garden will automatically install the nginx ingress controller for ephemeral Kubernetes. If you wish to disable it see [here](#using-your-own-ingress-controller).

## Configuring ingress

If you want to refer to the hostname that is assigned dynamically when the cluster is created, you can refer to that using the output `${providers.ephemeral-kubernetes.outputs.default-hostname}`. This can be useful if, for example, you want to expose an ingress on a subdomain of the default hostname.

For example, if you wish to expose `api` on `api.<default-hostname>`, you can use the following configuration for ingresses:

```yaml
....
ingresses:
    - path: /
      port: http
      hostname: api.${providers.ephemeral-kubernetes.outputs.default-hostname}
```

If you have multiple environments in your project you can template the hostname based on the environment e.g.:

```yaml
kind: Deploy
name: frontend
description: Frontend service container
type: container
build: frontend
variables:
  base-hostname: "${environment.name == 'ephemeral' ? providers.ephemeral-kubernetes.outputs.default-hostname : local.demo.garden}"
spec:
  ports:
    - name: http
      containerPort: 8080
  ingresses:
    - path: /
      port: http
      hostname: frontend.${var.base-hostname}
```

## Authentication for ingress

The ingress URLs are not publicly accessible and require authentication via GitHub. To preview an ingress URL, you need to authenticate with GitHub and authorize the "Garden Ephemeral Environment Previews" app.

The first time you attempt to preview an ingress URL, you will be automatically redirected to GitHub for authorization of the "Garden Ephemeral Environment Previews" app. This is a one-time step, and subsequent ingress previews won't require re-authorization, ensuring a seamless experience as long as you remain logged in to the GitHub.

{% hint style="info" %}
Ingress URLs are not shareable at the moment however we are planning to support this functionality in future releases. Stay tuned for further updates.
{% endhint %}

## DNS

Each cluster has it's own wildcard DNS entry, which ends in `preview.garden`. Your ingress links will be printed out for you by Garden and in the [dashboard](https://app.garden.io).

## Using your own ingress controller

For ephemeral Garden Kubernetes we recommend using our automatically shipped ingress controller. It is however possible to use an ingress controller of your choice, if you have a use-case where you need a specific ingress controller other than nginx. You can disable the garden installed nginx ingress controller in your provider configuration for `ephemeral-kubernetes`:

```yaml
providers:
  - name: ephemeral-kubernetes
    environments: [ephemeral]
    setupIngressController: false
```

For an ingress controller of your choice to work, it needs to use a service of type `LoadBalancer` and the service needs
to use the following annotations:

```yaml
"kubernetes.namespace.so/expose": "true"
"kubernetes.namespace.so/exposed-port-80": "wildcard"
"kubernetes.namespace.so/exposed-port-443": "wildcard"
```
