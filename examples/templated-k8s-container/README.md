# templated-k8s-container example

This example demonstrates the config templating feature, which allows users to define templates that generate multiple templated actions.

In this example we define a `ConfigTemplate` in [template/garden.yml](./template/garden.yml), and use that template in [service/garden.yml](./service/garden.yml) to generate a `container` Build to build a container image, and a `kubernetes` Deploy that deploys that image.

This allows teams to reduce the boilerplate in their projects, as well as to tailor deployments to their specific needs.

To see the generated action in detail, you can run `garden get actions --output=yaml`.

To test the example with a local Kubernetes cluster, simply run `garden deploy`.

For more complex use-cases and additional configuration options please refer to the [docs](../../docs/config-guides/config-templates.md).
