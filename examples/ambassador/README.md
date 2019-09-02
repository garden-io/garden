# Ambassador example project

This example project demonstrates how to use the [Ambassador API Gateway](https://www.getambassador.io/) instead of the default Nginx ingress controller. Ambassador is an open source, Kubernetes-Native, API Gateway built on the [Envoy Proxy](https://www.envoyproxy.io/). Services are configured via [annotations](https://docs.garden.io/reference/module-types/container#module-services-annotations) which Ambassador reads to configure its Envoy Proxy.

Even though we chose Ambassador for this project, the same principles apply to e.g. [Traefik](https://traefik.io/), which also supports configuring route mappings via service annotations.

The project is based on our [simple-project example](https://github.com/garden-io/garden/tree/v0.9.0-docfix.2/examples/simple-project) and installs Ambassador via the [Helm module type](https://docs.garden.io/reference/module-types/helm). To learn more about using Helm charts with Garden, take a look at our [Helm user guide](https://docs.garden.io/using-garden/using-helm-charts).

## Usage

This project doesn't require any specific set up and can be deployed in a single step with the `deploy` command:

```sh
garden deploy
```

Since we're letting Ambassador handle our ingresses, we don't define any in our `garden.yml` config files. Therefore, the `call` command won't work with this set up. Instead, we can use `curl` to check on our services.

To find the external IP for the Ambassador service, run:

```sh
kubectl get svc ambassador --namespace=custom-ingress-controller
```

It should return something like:

```sh
NAME         TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                        AGE
ambassador   LoadBalancer   10.102.14.233   localhost     8080:30634/TCP,443:30614/TCP   120m
```

Now we can call our services with:


```sh
curl localhost:8080/node-service/hello-node
```

which should return

```sh
Hello from Node service!
```

## Notes on configuration

### Project configuration

If you've looked at our other examples, the project configuration should look familiar with the exception of the `setupIngressController` key:

```yaml
kind: Project
name: custom-ingress-controller
environments:
  - name: local
    providers:
      - name: local-kubernetes
        setupIngressController: false
```

The `setupIngressController` key is specific to the `local-kubernetes` plugin. Setting it to `false` disables the default Nginx ingress controller.

### Ambassador configuration

We've configured the Ambassador service to listen on port `8080` since the default Nginx ingress controller might occupy the default port (`80`) if we're running other Garden projects. Here's the relevant configuration from `ambassador/garden.yml`:

```yaml
kind: Module
description: Ambassador API Gateway
type: helm
name: ambassador
chart: stable/ambassador
values:
  service:
    annotations:
      getambassador.io/config: |
        ---
        apiVersion: ambassador/v1
        kind: Module
        name: ambassador
        config:
          service_port: 8080 # Set port since the default ingress already occupies the default port
    http:
      port: 8080 # Set port since the default ingress already occupies the default port
```

### Module configuration

The module configuration is the same as for the `simple-project` example with the exception of annotations. Below is the configuration for our `go-service`:

```yaml
kind: Module
name: go-service
description: Go service container
type: container
services:
  - name: go-service
    ports:
      - name: http
        containerPort: 8080
        # Maps service:80 -> container:8080
        servicePort: 80
    annotations:
      getambassador.io/config: |
        ---
        apiVersion: ambassador/v1
        kind:  Mapping
        name:  go-service_mapping
        prefix: /go-service/
        service: go-service:80
```

Please refer to the [official Ambassador docs](https://www.getambassador.io/reference/mappings/) for more information on how to configure route mappings.
