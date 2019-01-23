# Voting example project with Helm charts

This is a clone of the [vote example project](../vote/README.md), modified to use Helm charts to describe
Kubernetes resources, instead of the `container` module type.

You'll notice that we still use the `container` module types for building the container images (the corresponding
`*-image` next to each service module), but they do not contain a `service` section.

The `helm` modules only contain the charts, which reference the container images. Garden will build the images
ahead of deploying the charts.

The usage and workflow is the same as in the [vote project](../vote/README.md), please refer to that for usage
instructions.
