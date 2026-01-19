---
title: Deploying to Production
order: 110
---

# Deploying to Production

Depending on your setup and requirements, you may or may not want to use Garden to deploy to your production environment. In either case, if you do configure your production environment in your Garden project configuration, we highly recommend that you set the [production flag](../reference/project-config.md#environmentsproduction) on it.

This will protect against accidentally messing with your production environments, by prompting for confirmation before e.g. deploying or running tests in the environment.

The flag is also given to each provider, which may modify behavior accordingly. In particular, when used with the `kubernetes` provider, it will do the following:

1. Set the default number of replicas for `container` Deploy actions to 3 (unless specified by the user).
2. Set a soft AntiAffinity setting for `container` Deploy actions to try to schedule Pods in a single Deployment across many nodes.
3. Set a restricted `securityContext` for Pods (runAsUser: 1000, runAsGroup: 3000, fsGroup: 2000) for `container` Deploy actions.
4. Increase the `RevisionHistoryLimit` on workloads to 10.
5. By default, running `garden deploy --force` will propagate the `--force` flag to `helm upgrade`, and set the `--replace` flag on `helm install` when deploying `helm` actions. This may be okay while developing but risky in production, so the `production` flag prevents both of those.

We would highly appreciate feedback on other configuration settings that should be altered when `production: true`. Please send us feedback via [GitHub issues](https://github.com/garden-io/garden/issues) or reach out on [Garden Discussions](https://github.com/garden-io/garden/discussions)!
