---
title: Shift Testing Left
order: 3
---

## Why shift testing left?

Most teams using Garden use Kubernetes for production. This means they already have their Dockerfiles, manifests and/or Helm charts.

Garden lets them re-use these resources so that developers can test in remote production-like environments _as they code_. This means:

- No more waiting for CI to see if integration tests pass
- Run and debug any test suite from your laptop _as you code_
- Easily write and maintain load tests, integration, and end-to-end tests with fast feedback loops
- Speed up your delivery cycle by shifting DAST and similar testing methodologies left

If your team is stuck in a commit, push, pray cycle, shifting tests all the way left can help break it.

{% hint style="info" %}
Check out [how Podium use Garden](https://garden.io/blog/testing-microservices) to end-to-end test 130 services, hundreds of times per day.
{% endhint %}

## How does it work?

![Run a test that passes then run it again. Note that the second time it's cached.](https://github.com/garden-io/garden/assets/5373776/978db934-6728-430d-aa24-56b1b5b6fd4a)

Testing is a first class primitive in Garden and teams use the Test action to define the tests for their project. These tests are typically run as a Kubernetes Pod in a production-like environment but there are several different options, depending on how the project is set up.

Developers use the `garden test` command to run all or specific tests from their laptop in a remote Kubernetes cluster as they code. They can also enable live code syncing to ensure a blazing feedback loop as they iterate on tests.

Similarly, tests can be run from a CI pipelines using the same commands.

Garden's smart caching ensures that only the tests belonging to the parts of your system that changed are executed which can dramatically speed up your pipelines.

## Key features

- **Visualize your dependency graph**, streams logs, and view command history with the [Garden dashboard](https://app.garden.io)
- **Hot reload** your changes for a fast feedback loop while writing and debugging tests with [Code Synchronization](https://docs.garden.io/guides/code-synchronization)
- **Never run the same test twice** thanks to Garden's [smart caching](../../overview/what-is-garden.md#caching)

## How can my team shift testing left?

Teams typically [adopt Garden in a few phases](../../misc/adopting-garden.md) and shifting tests left is one of the main milestones.

So with that in mind, these are the recommended next steps:

- Go through our [Quickstart guide](../../getting-started/quickstart.md)
- Check out the [First Project tutorial](../../tutorials/README.md) and/or [accompanying video](https://youtu.be/0y5E8K-8kr4)
- [Set up your remote cluster](../../garden-for/kubernetes/remote-kubernetes.md)
- [Add actions](../../garden-for/kubernetes/README.md) to build and deploy your project

{% hint style="info" %}
Join our [Discord community](https://go.garden.io/discord) 🌸 for access to Garden's dedicated Community Engineers and our AI chatbot 🤖  trained on our docs.
{% endhint %}

## Further Reading

- [What is Garden](../../overview/what-is-garden.md)
- [Adopting Garden](../../misc/adopting-garden.md)
- [Variables and Templating](../../features/variables-and-templating.md)

