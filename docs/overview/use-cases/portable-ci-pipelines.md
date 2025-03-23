---
title: Fast, Portable CI Pipelines that Run Anywhere
order: 2
---

## Why portable pipelines?

If you find yourself waiting for an entire CI pipeline to re-run just because you updated a commit message, Garden might be the tool for you. It can be the difference between _hours_ and _minutes_ across all stages of software delivery.

Teams typically use Garden to run tests, create preview environments, and share team namespaces in long-lived Kubernetes clusters. The more teams use Garden, the faster your CI pipelines become because everyone contributes to a shared cache. This is particularly useful for end-to-end tests, which are often the longest running tests in CI.

Similarly, when developers run the test from their laptop, Garden will also skip running it in CI. Since the test runs in a remote environment and Garden knows the version of every single file, they can trust that the test does indeed pass. No need to run it again.

Simply by adding extra environments to your Garden project, you can use Garden for local development _and_ for testing and deploying your project in CI.

## Key features

- **Cached builds and tests**: Garden caches your tests and builds so you **only run what has changed**. The result is dramatic reductions for CI run-times, typically *twenty minutes* to an *hour*.
- **Automatic environment cleanup**, **deep Insights into CI test, builds and deploys**, and **triggered CI runs** with [Garden Enterprise](https://garden.io/plans)
- **Encode once, run anywhere**: [Garden's Workflows](../../features/workflows.md) can be run from any environment, including local machines, CI servers, and cloud environments.
- **Visualize your CI/CD flow**: Use the [Garden dashboard](https://app.garden.io) to visualize your CI/CD pipeline, view logs, and track command history.
- **Accelerate build times**: With remote image builds, you can speed up your image build times significantly.

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features.

## Resources

- Garden's [Quickstart](../../getting-started/quickstart.md)
- [Using Garden in CircleCI](../../guides/using-garden-in-circleci.md)
- Garden's official [GitHub Action](https://github.com/marketplace/actions/garden-action).

{% hint style="info" %}
Join our [Discord community](https://go.garden.io/discord) 🌸 for access to Garden's dedicated Community Engineers and our AI chatbot 🤖  trained on our docs.
{% endhint %}

## Further Reading

- [What is Garden](../../overview/what-is-garden.md)
- [Using the CLI](../../guides/using-the-cli.md)
- [Variables and Templating](../../features/variables-and-templating.md)
- [Adopting Garden](../../misc/adopting-garden.md)
