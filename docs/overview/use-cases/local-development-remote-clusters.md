---
title: Local Development With Remote Clusters
order: 4
---

## Why develop with remote clusters?

Most teams using Garden use Kubernetes for production. This means they already have their Dockerfiles, manifests and/or Helm charts.

Garden lets them shift these resources left, without introducing friction or cognitive overload to developers, so that they can:

- Run their entire project in the cloud _as they develop_, irrespective of its size
- Share build caches with their team so that no two developers have to wait for the same build
- Easily write and maintain integration and end-to-end tests
- Developers barely need any dependencies on their local machines and new developers can be on-boarded in minutes
- Catch "production" bugs before they end up in production

If you worry your laptop may catch fire next time you run docker compose up, remote environments might be for you.

{% hint style="info" %}
Check out [how Open Energy Market use Garden](https://garden.io/blog/kubernetes-automation) to empower developers on K8s and reduce onboarding time by a whopping 500%.
{% endhint %}

## How does it work?

![Start the dev console, deploy in sync mode, and view progress in the dashboard](https://github.com/garden-io/garden/assets/5373776/914a7695-6453-4b34-becf-eab387e478a0)

Developers start their day by running `garden dev` and deploy their project into an isolated namespace in the team's Kubernetes development cluster, re-using existing config and manifests but overwriting values as needed with Garden’s template syntax.

Teams then use Garden’s sync functionality to live reload changes into running Pods in the remote cluster, without needing a full re-build or re-deploy on every code change. There’s typically a trade of between how realistic your environment is and the speed of the feedback but with Garden you can get both.

## Key features

- **Visualize your dependency graph**, streams logs, and view command history with the [Garden dashboard](https://app.garden.io)
- **Accelerate build times** with [Garden's Remote Container Builder](../../garden-for/containers/building-containers.md) and smart caching
- **Hot reload** your code to containers running in your local and remote Kubernetes clusters for a smooth inner loop with [Code Synchronization](https://docs.garden.io/guides/code-synchronization).

## How can my team develop against remote clusters?

Teams typically [adopt Garden in a few phases](../../misc/adopting-garden.md) and using remote clusters for inner loop development tends to be one of the last ones. Each phase solves a unique problem though so its well worth the journey.

So with that in mind, here are the recommended next steps:

- Go through our [Quickstart guide](../../getting-started/quickstart.md)
- Check out the [First Project tutorial](../../tutorials/README.md) and/or [accompanying video](https://youtu.be/0y5E8K-8kr4)
- [Set up your remote cluster](../../garden-for/kubernetes/remote-kubernetes.md)
- [Add actions](../../garden-for/kubernetes/README.md) to build and deploy your project
- [Configure code syncing](../../features/code-synchronization.md) so you can live reload changes to the remote cluster

## Further Reading

- [What is Garden](../../overview/what-is-garden.md)
- [Adopting Garden](../../misc/adopting-garden.md)
- [Variables and Templating](../../features/variables-and-templating.md)

## Examples

- [Kubernetes Deploy action example project](https://github.com/garden-io/garden/tree/0.14.17/examples/k8s-deploy-patch-resources)
