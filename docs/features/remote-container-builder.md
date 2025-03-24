---
title: Remote Container Builder
order: 1
---

The Remote Container Builder enables you to build container images using **blazing-fast, remote build compute instances** managed by Garden. Each built layer of your Dockerfile is stored on low-latency, high-throughput NVMe storage so that your entire team can benefit from shared build caches. This can result in [significantly faster builds](https://garden.io/blog/oem-cloud-builder).

Our free-tier includes a certain amount of build minutes and GBs of layer caching per month and you get more by switching to our team or enterprise tiers. You can learn more about the [different tiers here](https://garden.io/plans).

You can also use the [Builds UI](https://app.garden.io) to view build logs and analyze bottlenecks in your builds.

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/build-ui.gif"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/build-ui.gif"
      alt="Build UI"
    />
  </picture>
  <figcaption>Build UI</figcaption>
</figure>

## Using the Remote Container Builder

To use the Remote Container Builder you need to first [connect your project to the Garden Cloud backend](../guides/connecting-project.md).

Then you need to enable it in your project level Garden configuration by adding the following provider config:

```yaml

  - name: container
    gardenContainerBuilder:
      enabled: true
```

You can learn more about [enabling the Remote Container Builder here](../garden-for/containers/using-remote-container-builder.md).
