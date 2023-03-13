# Istio example project

This example project demonstrates how to set up [Istio](https://istio.io/), the open-source service mesh, with a Garden project.
It installs the Istio service mesh via Helm deploy actions and an [Istio Gateway](https://istio.io/latest/docs/setup/additional-setup/gateway/) with a Kubernetes deploy action.

The project itself is based on the [Istio Bookinfo example](https://istio.io/docs/examples/bookinfo/).

If you use Garden for other projects, the default Garden ingress controller may conflict with the Istio ingress gateway, even though the Garden ingress controller is disabled for this particular project. This is why the Istio ingress gateway in this project is configured to use port 8080 for HTTP instead of 80 and thus avoids any potential conflict.

## Usage

To deploy both the Istio control plane as well as the example project run:

```sh
garden deploy
```

To verify that it works, open `http://localhost:8080/productpage` in your browser.

## Notes on the services

The `details`, `productpage` and `ratings` services are Garden container actions that point to remote container images.

The `reviews` service is a [Helm action](https://docs.garden.io/reference/module-types/helm). That's because in the original Bookinfo example, the `reviews` service has three versions that each get deployed and routed to in a round robin fashion. So to stay true to the example, and because Garden doesn't currently support multiple deployments for a single service, we use the original example manifests and deploy them via the Helm plugin.

The `gateway` service is a also a Helm module, that uses the custom resource definitions deployed with the Istio base chart to add a `VirtualServer` and `Gateway` to route traffic from our Istio Ingress Gateway (see istio.garden.yaml) to the productpage frontend.
