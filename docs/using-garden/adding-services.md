---
order: 4
title: Adding Services
---

# Services

Services are the basic **unit of deployment** in Garden. You add them when you want to run your code somewhere. A simple service configuration looks like this:

```yaml
kind: Module
type: container
services:
  - name: backend
    ports:
      - name: http
        containerPort: 8080
```

> Note that not all [modules types](../reference/module-types/README.md) have services.

## How it Works

Services belong to modules and you'll usually have a single service per module. You can think of a service as a running instance of your module.

You deploy your services with the `garden deploy` command. You can also delete services with the `garden delete service` command. And you can get service logs with the `garden logs` command.

### Calling Services

> The following is specific to the Kubernetes providers.

If you specify a `port` for a given service, other services from inside the cluster can reach it. By default, it's reachable from `http://my-service:<port>/`.

If you specify an `ingress`, your can reach your service from outside the cluster. For example by using the `garden call` command or with `curl`.

The default ingress for local development is `http://demo-project.local.app.garden/<ingress-name>`. You can override this by setting a `hostname` under the `ingress` directive.

## Services in the Stack Graph

Services correspond to a **deploy** action in the Stack Graph.

- **Services** implicitly depend on the build step of their **parent module**.
- **Services** can depend on **tasks** and other **services**.
- **Tasks** and **tests** can depend on **services**.

## Examples

Here are some simple examples of services in Garden. Note that these are specific to Kubernetes.

### Simple Container Service

This example shows a backend service with a health check. Notice that it doesn't have an ingress since it's not meant to be reachable from the outside.

Notice also that the `servicePort` is set to `80`, the default port. This is so that we can call the service directly from within the cluster with `http://backend/my-endpoint`.

The `containerPort` (the port that the process inside the container is listening on) is set to `8080`.

Finally, we set an environment variable that's available to the service at runtime, and can be referenced in our code.

```yaml
kind: Module
type: container
services:
  - name: backend
    ports:
      - name: http
        containerPort: 8080
        servicePort: 80
    healthCheck:
      httpGet:
        path: /healthz
        port: http
  - env:
      # You can access this variable at runtime in your code.
      DATABASE_URL: https://my-database:5432/
```

### Frontend Service

This example shows a frontend service. It has an ingress so that it's reachable from outside the cluster. We've also set a custom `hostname` so that the full path becomes: `http://my-app.my-org/`.

This service has a dependency on a `backend` service which means it won't be deployed until the `backend` service has been deployed and is responding to health checks. This also means that the service gets re-deployed on changes to the backend.

```yaml
kind: Module
type: container
services:
  - name: frontend
    ports:
      - name: http
        containerPort: 8080
    ingresses:
      - path: /
        port: http
        hostname: my-app.my-org
    dependencies:
      - backend
```

## Advanced

### Disabling Services

Module types that allow you to configure services generally also allow you to disable services by setting `disabled: true` in the service configuration. You can also disable them conditionally using template strings. For example, to disable a `container` module service for a specific environment, you could do something like this:

```yaml
kind: Module
type: container
...
services:
  - name: frontend
    disabled: ${environment.name == "prod"}
    ...
```

Services are also implicitly disabled when the parent module is disabled.

### How Services Map to Kubernetes Resources

A container service maps to a Kubernetes [Deployment resource](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/). If you specify a `port`, Garden will create a [Service resource](https://kubernetes.io/docs/concepts/services-networking/service/) for the Deployment. And if you specify an `ingress`, Garden will create a corresponding Kubernetes [Ingress resource](https://kubernetes.io/docs/concepts/services-networking/ingress/).

By default the Kubernetes provider does a rolling update for deployments.

## Further Reading

For full service configuration by module type, please take a look at our [reference docs](../reference/module-types/README.md).

## Next Steps

In the [next section](./running-tests.md), we'll see how Garden can run your tests for you.
