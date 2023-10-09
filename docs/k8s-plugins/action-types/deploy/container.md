---
title: Container
order: 1
---

# TODO @eysi: Update

{% hint style="info" %}
The `container` action type is an abstraction that can be used with multiple plugins. [See here](../../../other-plugins/container.md) for an in-depth guide on the action type itself. Continue reading for more information on the container deploy action type that can be used with the Kubernetes plugin.
{% endhint %}

The Kubernetes plugins can deploy `container` deploy actions.

Garden will take the simplified `container` deploy specification and convert it to Kubernetes manifests, i.e. Deployment, Service and (if applicable) Ingress resources.

Here, for example, is the spec for the `frontend` service in our example [demo project](../../../../examples/demo-project/README.md):

```yaml
kind: Deploy
name: frontend
type: container

build: frontend
dependencies:
  - deploy.backend

spec:
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
...
```

The `build` field is used to specify a build action that builds the container that's used for the deploy. We also configure a health check, a couple of ingress endpoints, and specify that this deploy depends on the `backend` deploy. There is a number of other options, which you can find in the `container` action [reference](../../../reference/action-types/Deploy/container.md).

If you need to use advanced (or otherwise very specific) features of the underlying platform, you may need to use more platform-specific action types (e.g. `kubernetes` or `helm`). The `container` action type is not intended to capture all those features.

## Environment variables

Container services can specify environment variables, using the `services[].env` field:

```yaml
kind: Deploy
name: frontend
type: container
spec:
  env:
    MY_ENV_VAR: foo
    MY_TEMPLATED_ENV_VAR: ${var.some-project-variable}
...
```

`env` is a simple mapping of "name: value". [Template strings](../../../using-garden/variables-and-templating.md#template-string-overview) can also be used to interpolate values.

### Secrets

You can reference secrets in environment variables. For Kubernetes, this translates to `valueFrom.secretKeyRef` fields in the Pod specs, which direct Kubernetes to mount values from `Secret` resources that you have created in the application namespace, as environment variables in the Pod.

For example:

```yaml
kind: Deploy
name: frontend
type: container
spec:
  env:
    MY_SECRET_VAR:
      secretRef:
        name: my-secret
        key: some-key-in-secret
...
```

This will pull the `some-key-in-secret` key from the `my-secret` Secret resource in the application namespace, and make it available as an environment variable.

_Note that you must create the Secret manually for the Pod to be able to reference it._

For Kubernetes, this is commonly done using `kubectl`. For example, to create a basic generic secret you could use:

```sh
kubectl --namespace <my-app-namespace> create secret generic --from-literal=some-key-in-secret=foo
```

Where `<my-app-namespace>` is your project namespace (which is either set with `namespace` in your provider config, or defaults to your project name). There are notably other, more secure ways to create secrets via `kubectl`. Please refer to the official [Kubernetes Secrets docs](https://kubernetes.io/docs/concepts/configuration/secret/#creating-a-secret-using-kubectl-create-secret) for details.

Also check out the [Kubernetes Secrets example project](../../../../examples/kubernetes-secrets/README.md) for a working example.

