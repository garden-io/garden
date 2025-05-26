---
title: Installing Helm charts
order: 6
---

{% hint style="info" %}
To use Garden to install Helm charts you need to configure the [remote](./remote-kubernetes.md) or [local](./local-kubernetes.md) Kubernetes providers.
{% endhint %}

The [Helm](https://helm.sh/) package manager is one of the most commonly used tools for managing Kubernetes manifests. Garden supports using your own Helm charts, alongside your container builds, via the `kubernetes` and `local-kubernetes` providers. This guide shows you how to configure and use 3rd-party (or otherwise external) Helm charts, as well as your own charts in your Garden project. We also go through how to set up tests, runs and code synchronization for your charts.

In this guide we'll be using the [vote-helm](../../../examples/vote-helm/README.md) project. If you prefer to just check out a complete example, the project itself is also a good resource.

You may also want to have a look at the reference documentation for the helm [`deploy`](../../reference/action-types/Deploy/helm.md) action type.
[`helm-pod` run](../../reference/action-types/Run/helm-pod.md), [`helm-pod` test](../../reference/action-types/Test/helm-pod.md) and
[`kubernetes-exec`](../../reference/action-types/Run/kubernetes-exec.md) actions can be used for testing and task purposes.

_Note: If you only need a way to deploy some Kubernetes manifests and don't need all the features of Helm, you can_
_use the simpler `kubernetes` action instead. Check out the_
_[kubernetes guide](./deploy-k8s-resource.md) for more info._

## Referencing external charts

Using external charts, where the chart sources are not located in your own project, can be quite straightforward. At a
minimum, you just need to point to the chart, and perhaps provide some values as inputs. There are two options to deploy external Charts, [Helm chart repositories](https://helm.sh/docs/topics/chart_repository/) (Accessible via `https`) or [OCI-based registries](https://helm.sh/docs/topics/registries/).


### Example: Redis from Bitnami OCI Repository

A specific chart repository can be referenced via the `repo` field. This may be useful if you run your own Helm Chart Repository for your organization, or are referencing an action that isn't contained in the default Helm Repository.

```yaml
kind: Deploy
type: helm
name: redis
spec:
  chart:
    # Chart name is part of the OCI URL
    url: oci://registry-1.docker.io/bitnamicharts/redis
    version: "19.0.1"
  values:
    auth:
      enabled: false
```

### Example: Redis from Bitnami Helm Repository

A specific chart repository can be referenced via the `repo` field. This may be useful if you run your own Helm Chart Repository for your organization, or are referencing an action that isn't contained in the default Helm Repository.

```yaml
kind: Deploy
type: helm
name: redis
spec:
  chart:
    name: redis
    repo: https://charts.bitnami.com/bitnami
    version: "16.13.1"
  values:
    auth:
      enabled: false
```

## Local charts

Instead of fetching the chart sources from another repository, you'll often want to include your chart sources in your Garden project. To do this, you can simply add a `garden.yml` in your chart directory (next to your `Chart.yaml`) and start by giving it a name:

```yaml
kind: Deploy
description: My helm deploy action
type: helm
name: helm-deploy
```

You can also use Garden's external repository support, to reference chart sources in another repo:

```yaml
kind: Deploy
description: My helm deploy action
type: helm
name: helm-deploy
source:
  repository:
    url: https://github.com/my-org/my-helm-chart#v0.1
```

## `helm-pod` runs and tests

For tasks and tests either the `helm-pod` or `kubernetes-exec` actions can be used.

[`helm-pod` run](../../reference/action-types/Run/helm-pod.md) and [`helm-pod` test](../../reference/action-types/Test/helm-pod.md) actions will create a fresh kubernetes workload and run your command in it. These actions are cached. This means that if garden will not rerun them if the version of the action hasn't changed. If a remote kubernetes cluster is used, test results are stored there which allows to share test results between the team or ci runs to decrease the number or re-runs.

`helm-pod` actions don't have to depend on the deploy actions. The manifests are gathered from the rendered helm charts and deployed to the cluster.

Here's a test action from the [vote-helm example](../../../examples/vote-helm/vote/garden.yml).

```yaml
kind: Test
name: vote-integ-pod
type: helm-pod
dependencies:
  - deploy.api
variables:
  hostname: vote.${var.baseHostname}
timeout: 60
spec:
  resource:
    kind: Deployment
    name: vote-integ-pod
  command: [/bin/sh, -c, "npm run test:integ"]
  values:
...
```

## Providing values to the Helm chart

In most cases you'll need to provide some parameters to the Helm chart you're using. The simplest way to do this is via the `spec.values`field:

```yaml
kind: Deploy
type: helm
name: helm-deploy
...
spec:
  values:
    some:
      key: some-value
```

This will effectively create a new YAML with the supplied values and pass it to Helm when rendering/deploying the chart. This is particularly handy when you want to template in the values (see the next section for a good example).

You can also provide you own value files, which will work much the same way. You just need to list the paths to them (relative to the action root,
i.e. the directory containing the `garden.yml` file) and they will be supplied to Helm when rendering/deploying. For example:

```yaml
# garden.yml
kind: Deploy
type: helm
name: helm-deploy
...
spec:
  valueFiles:
    - values.default.yaml
    - values.${environment.name}.yaml
```

```yaml
# values.default.yaml
some:
  key: default-value
other:
  key: other-default
```

```yaml
# values.prod.yaml
some:
  key: prod-value
```

In this example, `some.key` is set to `"prod-value"` for the `prod` environment, and `other.key` maintains the default value set in `values.default.yaml`.

If you also set the `values` field in the Action configuration, the values there take precedence over both of the value files.

## Linking container builds and Helm deploy actions

When your project also contains one or more `container` build actions that build the images used by a `helm` deploy,
you want to make sure the containers are built ahead of deploying the Helm chart, and that the correct image tag is used when deploying.
The `vote-helm/worker` deploy and the corresponding `worker-image` build provide a simple example:

```yaml
kind: Build
type: container
name: worker-image

```

```yaml
kind: Deploy
description: Helm deploy for the worker container
type: helm
name: worker-deploy
dependencies: [build.worker-image]
spec:
  values:
    image:
      repository: ${actions.build.worker-image.outputs.deployment-image-name}
      tag: ${actions.build.worker-image.version}

```

Here the `worker-deploy` injects the `worker-image` version into the Helm chart via the `spec.values` field.
Note that the shape of the chart's `values.yaml` file will dictate how exactly you provide the image version/tag to the chart
(this example is based on the default template generated by `helm create`), so be sure to consult the reference for the chart in question.

Notice that this can also work if you use multiple containers in a single chart. You just add them all as dependencies, and the appropriate reference under `values`.

## Code Synchronization

Synchronization can be configured with helm deploys. In the example below code synchronization is set up from the `vote-image` build action's directory.


```yaml
kind: Deploy
type: helm
name: vote
...
spec:
  defaultTarget:
    kind: Deployment
    name: vote
  sync:
    paths:
      - containerPath: /app/src
        sourcePath: ${actions.build.vote-image.sourcePath}/src
        mode: two-way

```

For more information on synchronization check out the [Code Synchronization Guide](../../features/code-synchronization.md).

## Re-using charts

Often you'll want to re-use the same Helm charts for multiple actions. For example, you might have a generic template
for all your backend services that configures auto-scaling, secrets/keys, sidecars, routing and so forth, and you don't
want to repeat those configurations all over the place.

**TODO: allow non-relative paths for the chart and then write this**

## Production environments

You can define a remote environment as a `production` environment by setting the [production flag](../../reference/project-config.md#environmentsproduction) to `true`. This affects some default behavior when working with `helm` actions. See the [Deploying to production](../../guides/deploying-to-production.md) guide for details.

## Next steps

Check out the full [action reference](../../reference/action-types/README.md) for more details
and the [vote-helm](../../../examples/vote-helm/README.md) example project for a full project
that showcases Garden's Helm support.

Also check out the [Kubernetes action](./deploy-k8s-resource.md) if you don't need all the features of Helm.
