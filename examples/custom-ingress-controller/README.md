# Custom ingress controller example project

This example project demonstrates how to use the [Ambassador API Gateway](https://www.getambassador.io/) instead of the default Nginx ingress controller. It is based on the [`simple-project`](../simple-project) example. Even though we chose Ambassador for this project, the same principles apply to other technologies such as [Traefik](https://traefik.io/).

The core idea is to use the [Helm module type](https://docs.garden.io/reference/module-types/helm) to install custom Kubernetes objects. To learn more about using Helm charts with Garden, take a look at our [Helm user guide](https://docs.garden.io/using-garden/using-helm-charts).

For a detailed guide on how this project was set up, please refer to our [Using a custom ingress controller](https://docs.garden.io/using-garden/) guide.

## Usage

This project doesn't require and specific set up and you can simply run it with  the `deploy` command:

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

Note that we've configured the Ambassador service to listen on port `8080` since the default Nginx ingress controller already occupies the `80`, the default port. Here's the relevant configuration from `ambassador/garden.yml`:

```yaml
module:
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