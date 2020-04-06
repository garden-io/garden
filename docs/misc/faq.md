---
order: 1
title: FAQ
---

# FAQ

## Project Structure and Configuration

### How do I include multiple modules with multiple Dockerfiles in the same directory?

You will have to use the module level [`include`](https://docs.garden.io/reference/module-types/container#include) directive to specify which files belong to each module. You will also have to provide the path to the Dockerfile with the [`dockerfile`](https://docs.garden.io/reference/module-types/container#dockerfile) directive.

If the module only has a Dockerfile but no other files, say because it's a 3rd party image, you should set `include: []`.

See [this section](https://docs.garden.io/guides/configuration-files#multiple-modules-in-the-same-file) of our docs for more.

### Should I `.gitignore` the `.garden` dir?

Yes.

### How do I disable modules based on environments?

You can use the `disabled` field to disable [modules](https://docs.garden.io/using-garden/adding-modules#disabling-modules), [services](https://docs.garden.io/using-garden/adding-services#disabling-services), [tests](https://docs.garden.io/using-garden/running-tests#disabling-tests), and [tasks](https://docs.garden.io/using-garden/running-tasks#disabling-tasks).

### How do I use the `image` field in `container` modules? Is it for pulling or publishing images?

Both, actually.

**When building:** If the `image` field is specified and Garden can't find a Dockerfile for the module, Garden will use that image when deploying the module. If there is a Dockerfile, Garden will build the image from it, regardless of whether or not the `image` field is specified.

**When publishing:** If the `image` field is specified and the module has a Dockerfile, Garden will build the image from the Dockerfile and publish it to the URL specified in the `image` field. If there's no Dockerfile, the `publish` command will fail.

We aim to change to this behavior and make it more user-friendly with our next major release.

### When should I use the module level `include`/`exclude` fields? How are they different from the project level  `module.include/module.exclude` fields? What about ignore files?

Read all about it in [this section](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) of our docs.

### How do I share a single service (like a database) across multiple namespaces?

We recommend using the Terraform module for cloud services that are shared by your team.

You can also deploy `kubernetes` and `helm` modules to their own namespaces.

## Builds

### How do I target a specific image from a multi-stage Dockerfile?

Use the [`targetImage` field](https://docs.garden.io/reference/module-types/container#build-targetimage).

### How do I use base images?

See [this example project](https://github.com/garden-io/garden/tree/v0.11.11/examples/base-image).

### Can I use runtime variables in container builds (e.g. from tasks)?

No, only *modules* can be build dependencies and runtime outputs come from *tasks*, *tests*, and *services*.

### How do I view container build logs?

Set the log-level to `debug` or higher. For example:

```console
garden build --log-level debug
```

### Can I use a Dockerfile that lives outside the module root?

No. If you have multiple modules that use the same Dockerfile, you should instead have a single base image and then let each module have its own Dockerfile that's built on the base image. See the [base image example project](https://github.com/garden-io/garden/tree/v0.11.11/examples/base-image) for an example of this.

### How do I include files/dirs (e.g. shared libraries) from outside the module root with the build context?

See [this example project](https://github.com/garden-io/garden/tree/v0.11.11/examples/build-dependencies).

### How do I add Docker specific flags to the build command?

Use the module level  [`extraFlags` field](https://docs.garden.io/module-types/container#extraflags).

### How do I use different Dockerfiles for different environments?

You can use the `dockerfile` field. For example:

```console
dockerfile: "${environment.name == 'prod' ? Dockerfile.prod : Dockerfile.dev}"
```

See also the [base image example project](https://github.com/garden-io/garden/tree/v0.11.11/examples/base-image) for an example of this.

## Remote Building

### Can I run multiple `docker-daemon` instances for more build concurrency?

Not currently. Besides, multiple Docker daemons would not be able to share image layer caches.

You can, however, run multiple [Kaniko pods](https://docs.garden.io/guides/in-cluster-building#kaniko) in parallel. In some scenarios, that may scale better.

### How do I delete the services in the `garden-system` namespace?

Please **do not** delete the `garden-system` namespace directly, because Kubernetes may fail to remove persistent volumes. Instead, use this command:

```console
garden plugin kubernetes uninstall-garden-services --env <env-name>
```

It removes all cluster-wide Garden services.

### How do I pull a base image (using the FROM directive) from a private registry in in-cluster build mode?

See [this section](https://docs.garden.io/guides/in-cluster-building#pulling-base-images-from-private-registries) of our docs.

### How do I use my own private registry in in-cluster build mode?

See [this section](https://docs.garden.io/guides/in-cluster-building#using-private-registries-for-deployments) of our docs.

### How do I clean up the in-cluster registry and build sync volumes?

Use this command:

```console
garden plugins kubernetes cleanup-cluster-registry --env <env-name>
```

It's on our roadmap to automate this.

## Tasks and Tests

### Can I run a task on only the first time a service starts but not on subsequent restarts/rebuilds?

We've been pondering this, but there are a lot of variants to consider. The key issue is really that the notion of "first time" is kind of undefined as things stand.

So what we generally do is to make sure tasks are idempotent and exit early if they shouldn't run again. But that means the process still needs to be started, which is of course slower than not doing it at all.

### If tests have a task as a dependency, is the task re-run every time before the test?

It is, which is why we recommend that tasks are written to be idempotent. Tasks by nature don’t really have a status check, unlike services.

### Why is a task not triggered on changes in watch mode?

This is intentional, we don't re-run tasks on file watch events. We debated this behavior quite a bit and ultimately opted not to run task dependencies on every watch event.

### Why is my task not running on `garden deploy` or `garden dev`?

The task result is likely cached. Garden won't run tasks with cached results unless `cacheResult: false` is set on the task definition.

You can also run it manually with:

```console
garden run task <task-name>
```

This will run the task even if the result is cached.

### How do I clear cached task results?

Garden stores the task results as a ConfigMap under the `<project-name>--metadata` namespace. You can delete them manually with this command:

```console
kubectl delete -n <project-name>--metadata $(kubectl get configmap -n <project-name>--metadata -o name | grep task-result)
```

You can also run it manually with:

```console
garden run task <task-name>
```

This will run the task even if the result is cached.

### What's the difference between `garden test` and `garden run test`

The `garden test` command can run all your tests, or a subset of your tests, and has a `--watch` flag. It won't re-run tests that are cached unless the `--force` flag is set and it won't print the output unless the test fails. [See here](https://docs.garden.io/reference/commands#garden-test) for the synopsis and examples.

The `garden run test` command runs **a single test in interactive mode** regardless of whether or not it's cached. Interactive mode means that the output is streamed to the screen immediately and you can interact with it if applicable.

Note that due to a [known limitation](https://github.com/garden-io/garden/issues/1739), Garden can't copy artifacts for tests in interactive mode. You can disable it by setting `--interactive false`. [See here](https://docs.garden.io/reference/commands#garden-run-test) for the full synopsis.

We plan on making `--interactive=false` the default with our next major release.

## Secrets

### How do I pass secrets to container modules?

See [this section](https://docs.garden.io/guides/container-modules#secrets) of our docs.

### How do I mount secrets as volumes?

You'll need to use the [`kubernetes`](https://docs.garden.io/reference/module-types/kubernetes) or [`helm`](https://docs.garden.io/reference/module-types/helm) module types for that. Here's the official [Kubernetes guide](https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod) for mounting secrets as files.

### Can I use Kubernetes secrets as `buildArgs`?

No, Kubernetes secrets can only be used at runtime, by referencing them in the `environment` field of `tasks`, `services` and `tests`. See [the secrets section](https://docs.garden.io/guides/container-modules#secrets) of our docs for more.

Also note that secrets as `buildArgs` are considered a bad practice and a security risk.

### Can I access secrets across namespaces (e.g. if I have a global secret namespace)?

No, secrets have to be in the same namespace as the project. This is how Kubernetes secrets are designed, see [here for reference](https://kubernetes.io/docs/concepts/configuration/secret/#restrictions).

## Volumes and Data

### How do I mount persistent volumes?

See [this section](https://docs.garden.io/guides/container-modules#mounting-volumes) of our docs.

### How do I access files that are generated at runtime (e.g. migration files that are checked into version control)?

You can generate the files via a task, store them as artifacts, and copy them from the local artifacts directory. [Here's an example](https://docs.garden.io/using-garden/running-tests#test-artifacts) of this.

You can also use the [`persistentvolumeclaim`](https://docs.garden.io/reference/module-types/persistentvolumeclaim) module type to store data and share it across modules. See [this section](https://docs.garden.io/guides/container-modules#mounting-volumes) of our docs for more.

## Kubernetes

### How do I annotate ingresses?

You can set annotations on ingresses under the [`services[].ingresses[]` field](https://docs.garden.io/reference/module-types/container#services-ingresses-annotations).

### What versions and variations of Kubernetes does Garden support?

Garden interfaces with your cluster via `kubectl` and by using the Kubernetes APIs directly and should therefore work with all Kubernetes clusters that implement these. Garden is committed to supporting the latest six stable versions of Kubernetes.

### Can I add Kubernetes-specific fields to `container` modules (e.g. annotations and labels)?

No, you have to use the [`kubernetes`](https://docs.garden.io/reference/module-types/kubernetes) module type for that.

## Helm

### Are there any caveats to using the `helm` module type over `container` in terms of features?

To Garden, a single Helm chart is a single "unit of deployment", which echoes the Garden notion of "service".

Therefore, a Helm chart with multiple deployments will only show up as a single service in Garden. You can, of course, deploy it with Garden, but it doesn't map as naturally to Garden services. This means that service-level functionality such as hot-reloading and getting service logs won't work as expected.

That said, a single Helm module can have multiple container modules as build dependencies and refer to the resulting images. So it should work just fine, but you'll have a coarser granularity when it comes to deploying them.

## OpenFaaS

### Can I hot reload OpenFaaS functions?

Unfortunately it's currently not feasible to support hot reloading for OpenFaaS, since it would require quite a lot of upstream work in OpenFaaS itself.

## Misc

### When are you releasing the Plugin SDK?

We're exploring how we can release it incrementally. Please let us know if this is something you're interested in.

### What system components does Garden install?

The components installed when using the remote building functionality are discussed in the [In-cluster building docs](https://docs.garden.io/using-garden/in-cluster-building).

Garden also optionally installs Nginx. The `local-kubernetes` provider defaults to installing Nginx, but the (remote) `kubernetes` provider does not install it by default.

Furthermore, the `openfaas` provider installs some components necessary for OpenFaas to work.

Of course, we use Garden to install these components, and you’ll find the Garden modules for them in [in our source code](https://github.com/garden-io/garden/tree/master/garden-service/static) under `kubernetes/system` and `openfaas/system`.

### How does Garden resolve the `*.local.app.garden` domain?

The `*.local.app.garden` domain resolves to 127.0.0.1 via our DNS provider for convenience. If you want to use a different hostname for local development, you’ll have to add the corresponding entry to your hosts file.

### Does garden support bi-directional syncing?

No, it doesn't. See [this question](#how-do-i-access-files-that-are-generated-at-runtime-eg-migration-files-that-are-checked-into-version-control) above for accessing files that are generated at runtime.

### Is Garden stable or should I wait for 1.0?

Garden is currently in use by many teams. We don’t have a set date or plan to label it as 1.0, but we don't expect to do it anytime soon. For comparison, very widely used tools like Terraform are still not at 1.0.

We have a team of people working on it full-time, and we make it a priority to address all non-trivial bugs. We’re also happy to help out and answer questions via our community Slack.

### Does Garden work offline?

Garden is not currently designed to work in air-gapped environments This would require a fair amount of workarounds, unfortunately.