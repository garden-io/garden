---
title: How Organizations Adopt Garden
order: 4
---

This page outlines the different phases of adopting Garden. This is not meant as a how-to guide but rather a high-level overview.

The intended audience is a DevOps Engineer, Platform Engineer or a team lead looking to adopt Garden to speed up pipelines and improve developer experience for their team.

In what what follows we assume you have a basic understanding of Garden and its core concepts. If not, checkout the [Garden basics guide](../getting-started/basics.md).

## Phase 1 — On-demand environments

First thing you do is add some Garden config to your project so that you can use Garden to build and deploy it. The main steps involved are detailed in [this guide](../getting-started/next-steps.md).

Once you've done that initial set-up, you'll be able to spin up on-demand, isolated preview environments in a single command from anywhere—e.g. from your laptop as you code, or your CI pipelines during code review.

Other people on your team will benefit from the same. All they need to do is install the Garden CLI and they'll have on-demand production-like environments at their fingertips—quite literally.

And thanks to Garden's smart caching, these environments can be created lightning fast. For the very first preview environment created, Garden will build and deploy the project. For subsequent environments, Garden will only re-build the parts of the system that actually changed.

A lot of teams have gone from having a single, congested staging environment to blazing fast isolated preview environments for every pull request by the end of this phase. See e.g. [this case study](https://garden.io/blog/garden-is-the-best-companion-for-a-kubernetes-dev-from-local-envs-to-cd).

{% hint style="info" %}
[Garden Enterprise](https://garden.io/plans), our commercial offering, includes secrets management and RBAC to ensure you don’t need to add any secrets to your CI provider or setup secrets or local variables for development. This ensures 100% portability across all your environments.
{% endhint %}

## Phase 2 — Use Garden to test in CI and “as you code”

One of the main benefits of being able to spin up production-like environments on demand is that it vastly simplifies writing and maintaining end-to-end tests. No more waiting for a full CI pipeline to run tests, you can do that from your laptop, _as you code!_

This is why teams typically start adding Test actions to their Garden project after setting up on-demand environments.

At the end of this phase, you can run end-to-end tests from your CI pipelines with:

```console
garden test --env ci
```

Importantly, developers can run and debug these same tests from their laptops _as they code_, using the same command.

And again, Garden's smart caching ensures only the parts of your system that actually changed are tested. This is how [one team using Garden](https://garden.io/blog/testing-microservices) is able to end-to-end test a system of 130 services, hundreds of times a day.

## Phase 3 — Roll out production-like dev envs to your team

At this phase, your entire team should be able to spin up preview environments and run end-to-end tests on demand, across all stages of software delivery.

Next step is typically to roll out production-like development environments to your team so they can do day-to-day development _in the cloud_.

This means that each developer will have their own isolated namespace in a remote Kubernetes cluster where they're able to run their entire project without setting [their laptops on fire](https://garden.io/blog/you-dont-need-kubernetes-on-your-laptop).

This also means that new developers can get up and running in a matter of minutes. Since the project runs remotely and Garden automates all the workflows, setting up a development environment from scratch is as simple as cloning the project repo and running `garden dev`.

Thanks to Garden's [live reloading functionality](../features/code-synchronization.md), code changes stream directly to the running container in the remote cluster, ensuring blazing fast feedback. No need to wait for builds or deploys. This allows your team to develop in production-like environments that _feel_ just like local.

For more, check out [this case study](https://garden.io/blog/cloud-development) on how one team is giving their developers all the power of the cloud with non of the cognitive overload.

## Phase 4 — Roll Garden out to more teams

At this phase, you'll have codified all your workflows with Garden and simplified your entire delivery pipeline by re-using the same config and commands across all stages of delivery.

Your team may also be developing in production-like environments and is able to run the entire test suite without needing to wait for CI.

At this point, you can start using Garden to consolidate workflows and tooling across the entire organisation. You can e.g. create [templates](../features/config-templates.md) that allow you to author re-useable config that can be shared across teams to ensure consistency and compliance.

Similarly you can add [custom commands](../features/custom-commands.md) to standarize workflows and add our [Pulumi](../garden-for/pulumi/README.md) or [Terraform](../garden-for/terraform/README.md) to truly codify your entire delivery process—including infrastructure provisioning.

You can learn more in [this blog post](https://garden.io/blog/garden-linkerd) on building the perfect internal developer platform with Linkerd and Garden.

## Next Steps

Now that you have a feel for how teams typically adopt Garden, we recommend diving right in with our [Quickstart guide](../getting-started/quickstart.md) or learning how to [add Garden to your own project](../getting-started/next-steps.md).

And if you have any questions, don't hesitate to reach out on [Garden Discussions](https://github.com/garden-io/garden/discussions).
