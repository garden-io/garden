---
title: Portable CI Pipelines that Run Anywhere
order: 2
---

## Why portable pipelines?

If you find yourself waiting for an entire CI pipeline to re-run just because you updated a commit message, Garden might be the tool for you. It can be the difference between _hours_ and _minutes_ across all stages of software delivery.

Teams typically use Garden to run tests, create preview environments, and share team namespaces in long-lived Kubernetes clusters. The more teams use Garden, the faster your CI pipelines become because everyone contributes to a shared cache. This is particularly useful for end-to-end tests, which are often the longest running tests in CI.

Similarly, when developers run the test from their laptop, Garden will also skip running it in CI. Since the test runs in a remote environment and Garden knows the version of every single file, they can trust that the test does indeed pass. No need to run it again.

Simply by adding extra environments to your [Garden project](../using-garden/projects.md), you can use Garden for local development _and_ for testing and deploying your project in CI.

## Key features

- **Cached builds and tests**: Garden caches your tests and builds so you **only run what has changed**. The result is dramatic reductions for CI run-times, typically *twenty minutes* to an *hour*.
- **Automatic environment cleanup**, **deep Insights into CI test, builds and deploys**, and **triggered CI runs** with [Garden Enterprise](https://garden.io/plans)
- **Encode once, run anywhere**: [Garden's Workflows](../using-garden/workflows.md) can be run from any environment, including local machines, CI servers, and cloud environments.
- **Visualize your CI/CD flow**: Use the [Garden Web Dashboard](https://app.garden.io) to visualize your CI/CD pipeline, view logs, and track command history.
- **Accelerate build times**: With [remote image builds](../k8s-plugins/guides/in-cluster-building.md), you can speed up your image build times significantly.
- **Test in ephemeral environments**: Use [ephemeral clusters](../k8s-plugins/ephemeral-k8s/configure-provider.md) to test changes or run services in CI.

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features.

## Next Steps

- Visit our [quickstart](../getting-started/quickstart.md)

{% hint style="info" %}
If you encounter any issues or bugs 🐛 in this seed, don't hesitate to join our [Discord community](https://go.garden.io/discord) 🌸 for access to Garden's dedicated Community Engineers and our AI chatbot 🤖  trained on our docs.
{% endhint %}

## Additional resources

- [How Garden Works](../overview/how-garden-works.md)
- [Configuration Overview](../using-garden/configuration-overview.md)
- [Using the CLI](../using-garden/using-the-cli.md)
- [Variables and Templating](../using-garden/variables-and-templating.md)
- [Adopting Garden](../overview/adopting-garden.md)
