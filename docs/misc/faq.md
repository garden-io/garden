---
order: 1
title: FAQ
---

# FAQ

## Project Structure and Configuration

### How do I include Builds with multiple Dockerfiles in the same directory?

You will have to use the top-level [`include`](../reference/action-types/Build/container.md#include) directive to specify which files belong to each Build. You will also have to provide the path to the Dockerfile with the [`spec.dockerfile`](../reference/action-types/Build/container.md#specdockerfile) directive.

### Should I `.gitignore` the `.garden` dir?

Yes.

### How do I disable actions based on environments?

You can explicitly set in which environments the action should be used like so:

```yaml
kind: Build
type: container
name: my-build
environments: [dev, ci]
```

You can also use the `disabled` field to disable actions.

### When should I use the action-level `include`/`exclude` fields? How are they different from the project-level `scan.include`/`scan.exclude` fields? What about ignore files?

Read all about it in [this section](../config-guides/include-exclude.md) of our docs.

### How do I share a single service (like a database) across multiple namespaces?

We recommend using the Terraform or Pulumi actions for cloud services that are shared by your team.

You can also deploy `kubernetes` and `helm` actions to their own namespaces.

### How do I share code between Build actions?

You can use the [`copyFrom` directive](../reference/action-types/Build/container.md#copyfrom) for that. See [this example project](../../examples/build-dependencies/README.md).

Alternatively you can hoist your `garden.yml` file so that it is at the same level or parent to all relevant build context and use the `include` field.

See this [GitHub issue](https://github.com/garden-io/garden/issues/1954) for more discussion on the two approaches.

### What do all those `v-<something>` versions mean, and why are they different between building and deploying?

These are the _Garden versions_ that are computed for each action in the Stack Graph at runtime, based on source files and configuration for each action. See [here](../reference/glossary.md#versions) for more information about how these work and how they're used.

You may notice that a version of a Build action is different from the version the Deploy for that Build. This is because the Deploy's version also factors in the runtime configuration for that deploy, which often differs between environments, but we don't want those changes to require a rebuild.

## Builds

### How do I target a specific image from a multi-stage Dockerfile?

Use the [`spec.targetStage` field](../reference/action-types/Build/container.md#spectargetstage).

### How do I use base images?

See [this example project](../../examples/base-image/README.md).

### Can I use runtime variables in builds (e.g. from Runs or Tests)?

Yes, but only since Garden 0.13.

### How do I view container build logs?

Set the log-level to `verbose` or higher. For example:

```console
garden build --log-level verbose
```

### Can I use a Dockerfile that lives outside the action directory?

Yes. Generally Dockerfiles need to be in the same directory or a child directory relative to your Garden action but you can always set the source path for the action with the `source.path` field.


For example, let's say you have the following project structure:

```console
.
├── api
│   ├── garden.yml
│   ├── manifests
│   └── src
└── dockerfiles
    └── api.dockerfile
```

In this case the recommended approach is to set the `source.path` field like so:

```yaml
# In ./api/garden.yml
kind: Build
name: api
type: container
source:
  path: ../ # <--- Set the action source to the project root
include: [./api/**/*, ./dockerfiles/api.dockerfile] # <--- We need to specify includes since we told Garden the action source is at the root. The includes are relative to the source path we set.
spec:
  dockerfile: api.dockerfile # <--- If our Dockerfile isn't called 'Dockerfile' we need to specify the name here
---
kind: Deploy
name: api
type: kubernetes
spec:
  files: [./manifests/*] # <--- The Deploy action source path is still the ./api directory and specify the manifests with relative to it
```

Alternatively you can hoist the `garden.yml` for the `api` to the root of the project and e.g. call it `api.garden.yml`. In that case your config will look like this:

```yaml
# In api.garden.yml
kind: Build
name: api
type: container
include: [./api/**/*, ./dockerfiles/api.dockerfile] # <--- We need to specify includes because the action is at the root of the project.
spec:
  dockerfile: api.dockerfile # <--- If our Dockerfile isn't called 'Dockerfile' we need to specify the name here
---
kind: Deploy
name: api
type: kubernetes
spec:
  files: [./api/manifests/*] # <--- The action config is at the root so we need to include the `./api` dir here
```

If you need the Dockerfile outside of the Build root because you want to share it with other Build actions, you could also consider having a single base image instead and then let each action have its own Dockerfile that's built on the base image. See the [base image example project](../../examples/base-image/README.md) for an example of this.

### How do I include files/dirs (e.g. shared libraries) from outside the action root with the build context?

See [this example project](../../examples/build-dependencies/README.md).

### How do I add Docker specific flags to the build command?

Use the [`spec.extraFlags` field](../reference/action-types/Build/container.md#specextraflags).

### How do I use different Dockerfiles for different environments?

You can use the [`spec.dockerfile`](../reference/action-types/Build/container.md#specdockerfile) field. For example:

```console
spec:
  dockerfile: "${environment.name == 'prod' ? Dockerfile.prod : Dockerfile.dev}"
```

See also the [base image example project](../../examples/base-image/README.md) for an example of this.

## Remote Building

### How do I delete the services in the `garden-system` namespace?

Please **do not** delete the `garden-system` namespace directly, because Kubernetes may fail to remove persistent volumes. Instead, use this command:

```console
garden plugins kubernetes uninstall-garden-services --env <env-name>
```

It removes all cluster-wide Garden services.

## Tests and Runs

### Can I run a Run on only the first time a service starts but not on subsequent restarts/rebuilds?

We've been pondering this, but there are a lot of variants to consider. The key issue is really that the notion of "first time" is kind of undefined as things stand.

So what we generally do is to make sure Runs are idempotent and exit early if they shouldn't run again. But that means the process still needs to be started, which is of course slower than not doing it at all.

### If a Test has a Run as a dependency, is the Run re-run every time before the Test?

It is, which is why we recommend that Runs are written to be idempotent. Runs by nature don’t really have a status check, unlike Deploys.

### Why is my Run not running on `garden deploy`?

The Run result is likely cached. Garden won't run Runs with cached results unless `spec.cacheResult: false` is set on the Run definition.

You can also run it manually with:

```console
garden run <run-name>
```

This will run the Run even if the result is cached.

### How do I clear cached Run results?

Garden stores the Run results as a ConfigMap in your namespace. You can delete them manually with this command:

```console
kubectl delete -n <your-namespace> $(kubectl get configmap -n <your-namespace> -o name | grep run-result)
```

You can also run it manually with:

```console
garden run <run-name>
```

This will run the Run even if the result is cached.

## Secrets

### How do I mount secrets as volumes?

You'll need to use the [`kubernetes`](../garden-for/kubernetes/deploy-k8s-resource.md) or [`helm`](../garden-for/kubernetes/install-helm-chart.md) action types for that. Here's the official [Kubernetes guide](https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod) for mounting secrets as files.

### Can I use Kubernetes secrets as `buildArgs` for docker Builds?

No, Kubernetes secrets can only be used at runtime, by referencing them in the `spec.env` field of Run, Deploy and Test Actions.

Also note that secrets as `buildArgs` are considered a bad practice and a security risk.

### Can I access secrets across namespaces (e.g. if I have a global secret namespace)?

No, secrets have to be in the same namespace as the project. This is how Kubernetes secrets are designed, see [here for reference](https://kubernetes.io/docs/concepts/configuration/secret/#restrictions).

## Volumes and Data

### How do I access files that are generated at runtime (e.g. migration files that are checked into version control)?

You can generate the files via a Run, store them as artifacts, and copy them from the local artifacts directory. [Here's an example](../garden-for/kubernetes/run-tests-and-tasks.md#test-artifacts) of this.

## Kubernetes

### How do I annotate ingresses with container actions?

You can set annotations on ingresses under the [`spec.ingresses[]` field](../reference/action-types/Deploy/container.md#specingresses).

### What versions and variations of Kubernetes does Garden support?

Garden interfaces with your cluster via `kubectl` and by using the Kubernetes APIs directly and should therefore work with all Kubernetes clusters that implement these. Garden is committed to supporting the latest six stable versions of Kubernetes.

### How do I avoid being rate limited by Docker Hub?

Garden uses a handful of utility images that are hosted on [Docker Hub](https://hub.docker.com) under the `gardendev` repository and under heavy usage, users can get rate limited when deploying them.

We're in the process of applying for becoming a Verified Docker Publisher which should significantly reduce the chance of being rate limited.

In the meantime, you have the following options:

**Option 1 — Crate a Docker Hub image pull secret:**

First follow the steps in [this guide](../tutorials/remote-k8s/configure-registry/docker-hub.md) to create an image pull secret for
Docker Hub.

Then add the name and namespace of the secret you created to the `imagePullSecrets` field of the Kubernetes provider:

```yaml
kind: Project
name: my-project
#...
providers:
  - name: kubernetes
    imagePullSecrets:
      - name: <the-secret-name>
        namespace: <the-secret-namespace>
```

This also works for the `local-kubernetes` and `ephemeral-kubernetes` providers.

**Option 2 — Use a registry mirror:**

If you already have your own Docker Hub registry mirror set up you can use that by setting the `utilImageRegistryDomain` field on the Kubernetes provider:

```yaml
kind: Project
name: my-project
#...
providers:
  - name: kubernetes
    utilImageRegistryDomain: https://<my-private-registry-domain>
```

This also works for the `local-kubernetes` and `ephemeral-kubernetes` providers.

## Local scripts

### How do I execute long running local scripts?

By setting `persistent: true` on `exec` Deploy actions. [See here](../garden-for/local-scripts.md) for more.

### Can I _receive_ traffic to local service Telepresence style?

Yes, by using the `localMode`  field on the relevant Deploy action. [See here](https://docs.garden.io/v/docs-edge-2/guides/running-service-in-local-mode) for details.

## Misc

### How do I install the edge release of Garden

You can install the edge release of Garden 0.14 (Cedar) by using the Garden `self-update` command like so:

```console
garden self-update edge-cedar
```

You can learn more about [updating Garden here](../guides/installation.md#updating-garden).

### When are you releasing the Plugin SDK?

We're exploring how we can release it incrementally. Please let us know if this is something you're interested in.

### How does Garden resolve the `*.local.demo.garden` domain?

The `*.local.demo.garden` domain resolves to 127.0.0.1 via our DNS provider for convenience. If you want to use a different hostname for local development, you’ll have to add the corresponding entry to your hosts file.

### Does garden support bi-directional syncing?

Yes! `two-way` sync mode can be configured with Garden sync mode. See [this guide](../config-guides/code-synchronization.md)

### Is Garden stable or should I wait for 1.0?

Garden is currently in use by many teams. We don’t have a set date or plan to label it as 1.0, but we don't expect to do it anytime soon.

We have a team of people working on it full-time, and we make it a priority to address all non-trivial bugs. We’re also happy to help out and answer questions via [our Discord community](https://discord.gg/FrmhuUjFs6).

### Does Garden work offline?

Garden is not currently designed to work in air-gapped environments but if you have done the initial setup and use a
local kubernetes provider it might work.

### How do I disable terminal colors?

You can disable terminal colors with the `NO_COLOR` environment variable. For example:

```console
NO_COLOR=1 garden deploy
```
