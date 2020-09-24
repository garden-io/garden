# templated-k8s-container example

This example demonstrates the new module templating feature, which allows users to define templates that generate multiple templated modules—and even supporting files—by defining a ModuleTemplate and a `templated` module that references that template.

In this example we define a `ModuleTemplate` in `template/garden.yml`, and use that template in `module/garden.yml` to generate a `container` module to build a container image, and a `kubernetes` module that deploys that image.

This allows teams to reduce the boilerplate in their projects, as well as to tailor deployments to their specific needs.

To see the generated modules in detail, you can run `garden get modules --output=yaml`. After running this you'll find a `.manifest.yml` file in the `module` directory, generated from the source template in `template/manifests.yml`. You can take a look at that to see the Kubernetes manifests that will be used for deployment.

To test the example with a local Kubernetes cluster, simply run `garden deploy`.
