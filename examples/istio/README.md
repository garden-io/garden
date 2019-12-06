# Istio example project

This example project demonstrates how to set up [Istio](https://istio.io/), the open-source service mesh, with a Garden project. Below you'll find brief instructions on how to install Istio via [Helm](https://helm.sh). It is recommended that you also look at the [official guide](https://istio.io/docs/setup/getting-started/) for different install options and in-depth explanations.

Note that if you use Garden for other projects, the default Garden ingress controller may conflict with the Istio ingress gateway, even though the Garden ingress controller is disabled for this particular project. See [Step 2](#step-2---change-default-istio-port-optional) below for how to resolve this.

The project itself is based on the [Istio Bookinfo example](https://istio.io/docs/examples/bookinfo/).

## Prerequisites

The Istio install instructions assume you have [Helm](https://github.com/helm/helm#install) installed.

## Setup

### Step 1 - Download Istio

Download the latest Istio release:

```sh
curl -L https://git.io/getLatestIstio | sh -
```

and change into the directory, e.g.:

```sh
cd istio-1.0.6
```

### Step 2 - Change default Istio port (optional)

When initializing a project that uses the `local-kubernetes` provider, Garden will install a Nginx ingress controller into the `garden-system` namespace, unless the [`setupIngressController`](https://docs.garden.io/reference/providers/local-kubernetes#project-environments-providers-setupingresscontroller) directive is set to false. In this example we have done just that:

```yaml
    providers:
      - name: local-kubernetes
        setupIngressController: false
```

However, if you've used Garden for other projects, chances are that the Garden ingress controller is already installed and listening on port `80`.

Since the default port for the `istio-ingress-gateway` load balancer is also port `80`, we recommend that you change that value to prevent any conflicts. To do that, open the `install/kubernetes/helm/istio/values.yaml` file from inside the Istio release directory we downloaded in Step 1, and set the `http2` port for the `istio-ingressgateway` to `8080`:

```yaml
gateways:
  ...
  istio-ingressgateway:
    ...
    ports:
    - port: 8080  # Change this from 80 to 8080!
      targetPort: 80
      name: http2
      nodePort: 31380
```

### Step 3 - Install Istio components via Helm

Still in the Istio directory, we can now render the template and install the Istio components into the `istio-system` namespace:

```sh
helm template install/kubernetes/helm/istio --name istio --namespace istio-system > istio.yaml
kubectl create namespace istio-system
kubectl apply -f istio.yaml
```

### Step 4 - Prepare your project namespace

For Istio to work, we need to label the project namespace. The namespace name is by default the same as the project name, in this case `istio-example`.
Once the project namespace has been created, we need to label it with `istio-injection=enabled` for the Istio-sidecar-injector to work:

```sh
kubectl create namespace istio-example
kubectl label namespace istio-example istio-injection=enabled
```

## Usage

Once you've completed the setup steps, you can deploy the project with:

```sh
garden deploy
```

To verify that it works, open `http://localhost:8080/productpage` in your browser.

## Notes on the services

The `details`, `productpage` and `ratings` services are Garden container modules that point to remote container images.

The `reviews` service is a [Helm module](https://docs.garden.io/reference/module-types/helm). That's because in the original Bookinfo example, the `reviews` service has three versions that each get deployed and routed to in a round robin fashion. So to stay true to the example, and because Garden doesn't currently support multiple deployments for a single service, we use the original example manifests and deploy them via the Helm plugin.

The `gateway` service is a also Helm module, that wraps the Istio Gateway. It contains the Custom Resource Definitions (CRDs) needed for Istio to handle routing for our project.
