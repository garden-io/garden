---
title: Container
order: 1
---

{% hint style="info" %}
The `container` module type is an abstraction that can be used by multiple plugins. [See here](../../other-plugins/container.md) for an in-depth guide on the module type itself. Continue reading for how to deploy it with the Kubernetes plugin.
{% endhint %}

The Kubernetes plugins can deploy `container` modules that define one or more `services`.

Garden will take the simplified `container` service specification and convert it to the corresponding Kubernetes manifests, i.e. Deployment, Service and (if applicable) Ingress resources.

Here, for example, is the spec for the `frontend` service in our example [demo project](https://github.com/garden-io/garden/tree/0.12.49/examples/demo-project):

```yaml
kind: Module
name: frontend
description: Frontend service container
type: container
services:
  - name: frontend
    ports:
      - name: http
        containerPort: 8080
    healthCheck:
      httpGet:
        path: /hello-frontend
        port: http
    ingresses:
      - path: /hello-frontend
        port: http
      - path: /call-backend
        port: http
    dependencies:
      - backend
...
```

This, first of all, tells Garden that it should deploy the built `frontend` container as a service with the same name. We also configure a health check, a couple of ingress endpoints, and specify that this service depends on the `backend` service. There is a number of other options, which you can find in the `container` module [reference](../../reference/module-types/container.md#services).

If you need to use advanced (or otherwise very specific) features of the underlying platform, you may need to use more platform-specific module types (e.g. `kubernetes` or `helm`). The `container` module type is not intended to capture all those features.

### Environment variables

Container services can specify environment variables, using the `services[].env` field:

```yaml
kind: Module
type: container
name: my-container
services:
  - name: my-container-service
    ...
    env:
      MY_ENV_VAR: foo
      MY_TEMPLATED_ENV_VAR: ${var.some-project-variable}
    ...
...
```

`env` is a simple mapping of "name: value". Above, we see a simple example with a string value, but you'll also commonly use [template strings](../../using-garden/variables-and-templating.md#template-string-basics) to interpolate variables to be consumed by the container service.

#### Secrets

As of Garden v0.10.1 you can reference secrets in environment variables. For Kubernetes, this translates to `valueFrom.secretKeyRef` fields in the Pod specs, which direct Kubernetes to mount values from `Secret` resources that you have created in the application namespace, as environment variables in the Pod.

For example:

```yaml
kind: Module
type: container
name: my-container
services:
  - name: my-container-service
    ...
    env:
      MY_SECRET_VAR:
        secretRef:
          name: my-secret
          key: some-key-in-secret
    ...
...
```

This will pull the `some-key-in-secret` key from the `my-secret` Secret resource in the application namespace, and make it available as an environment variable.

_Note that you must create the Secret manually for the Pod to be able to reference it._

For Kubernetes, this is commonly done using `kubectl`. For example, to create a basic generic secret you could use:

```sh
kubectl --namespace <my-app-namespace> create secret generic --from-literal=some-key-in-secret=foo
```

Where `<my-app-namespace>` is your project namespace (which is either set with `namespace` in your provider config, or defaults to your project name). There are notably other, more secure ways to create secrets via `kubectl`. Please refer to the official [Kubernetes Secrets docs](https://kubernetes.io/docs/concepts/configuration/secret/#creating-a-secret-using-kubectl-create-secret) for details.

Also check out the [Kubernetes Secrets example project](https://github.com/garden-io/garden/tree/0.12.49/examples/kubernetes-secrets) for a working example.

