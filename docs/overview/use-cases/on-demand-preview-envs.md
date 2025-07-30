---
title: Isolated On-Demand Preview Environments
order: 1
---

## Why isolated on-demand preview environments?

Most teams using Garden use Kubernetes for production. This means they already have their Dockerfiles, manifests and/or Helm charts.

Garden lets them re-use these resources to create isolated preview environments on-demand so that they can:

- Review changes for every pull request in a production-like environment
- Easily share work in progress, even before pushing their code
- Test out their changes as they develop

If your staging environment is a bottleneck where changes get queued up, isolated preview environments might be the solution.

{% hint style="info" %}
Check out [how Slite uses Garden](https://garden.io/blog/garden-is-the-best-companion-for-a-kubernetes-dev-from-local-envs-to-cd) to clear up their once congested staging environment.
{% endhint %}

## How does it work?

![Deploy project then deploy again in a different env. Note the different URLs](https://github.com/garden-io/garden/assets/5373776/bdac24a9-4e77-47f4-87dd-c68730fb601a)

Developers run the `garden deploy` command from their laptops to create a preview environment in their own namespace in the team's remote Kubernetes cluster.

Similarly, Garden can be run from CI pipelines to create isolated preview environments with each pull request, using e.g. the pull request number to isolate the environment. For example, you may have a CI job that runs `garden deploy --env preview`.

Garden's powerful templating engine ensures that namespaces and hostnames are unique across users and CI runs—and Garden's smart caching ensures creating these environments is blazing fast.

## Key features

- **View URLs**, logs, and command history with the [Garden dashboard](https://app.garden.io)
- **Accelerate build times** with [Garden's Remote Container Builder](../../garden-for/containers/building-containers.md) and smart caching
- **Isolate environments** with [Garden's template syntax](../../features/variables-and-templating.md)

## How can my team get on-demand preview environments?

Teams typically [adopt Garden in a few phases](../../misc/adopting-garden.md) and setting up on-demand preview environments tends to be the first one.

So with that in mind, these are the recommended next steps:

- Go through our [Quickstart guide](../../getting-started/quickstart.md)
- Check out the [First Project tutorial](../../tutorials/README.md) and/or [accompanying video](https://youtu.be/0y5E8K-8kr4)
- [Set up your remote cluster](../../garden-for/kubernetes/remote-kubernetes.md)
- [Add actions](../../garden-for/kubernetes/README.md) to build and deploy your project
- Follow our guide on [environments and namespaces](../../guides/namespaces.md) to ensure each preview environment is isolated

{% hint style="info" %}
Join our [Discord community](https://go.garden.io/discord) 🌸 for access to Garden's dedicated Community Engineers and our AI chatbot 🤖  trained on our docs.
{% endhint %}

## Further Reading

- [What is Garden](../../overview/what-is-garden.md)
- [Adopting Garden](../../misc/adopting-garden.md)
- [Variables and Templating](../../features/variables-and-templating.md)

## Examples

- [Kubernetes Deploy action example project](https://github.com/garden-io/garden/tree/0.14.6/examples/k8s-deploy-patch-resources)
