---
title: Building Containers
order: 2
---

You can build containers with the `container` Build action:

```yaml
kind: Build
name: api
type: container
```

Most commonly you'll then want to deploy this image or use it in Test or Run actions. You can do that by referencing the output from the build in your Deploy actions via the `${actions.build.outputs.api.<output-name>}` template string.

For example, to deploy this image with Helm you can use the following config:

```yaml
kind: Deploy
name: api
type: helm
dependencies: [build.api] # <--- We need to specify the dependency here
spec:
  values:
    repository: ${actions.build.api.outputs.deploymentImageName}
    tag: ${actions.build.api.version}
```

Or you can set it in your Kubernetes manifests with the `patchResources` field:

```yaml

kind: Deploy
type: kubernetes
name: api
dependencies: [build.api] # <--- We need to specify the dependency here
spec:
  manifestFiles: [my-manifests.yml]
  patchResources:
    - name: api # <--- The name of the resource to patch, should match the name in the K8s manifest
      kind: Deployment # <--- The kind of the resource to patch
      patch:
        spec:
          template:
            spec:
              containers:
                - name: api # <--- Should match the container name from the K8s manifest
                  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
```

You can learn more in the individual guides for the Kubernetes [Deploy](../kubernetes/deploy-k8s-resource.md) and [Run and Test](../kubernetes/run-tests-and-tasks.md) actions.

## Examples


### Building images

Following is a bare minimum `Build` action using the `container` type:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
```

If you have a `Dockerfile` in the same directory as this file, this is enough to tell Garden to build it. However, you can override the `Dockerfile` name or path by specifying `spec.dockerfile: <path-to-Dockerfile>`. You might also want to explicitly [include or exclude](../../guides/include-exclude.md) files in the build context.

### Setting build arguments

You can specify [build arguments](https://docs.docker.com/engine/reference/commandline/build/#build-arg) using the [`spec.buildArgs`](../../reference/action-types/Build/container.md#specbuildargs) field. This can be quite handy, especially when e.g. referencing other `Build` action as build dependencies:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
# Here, we ensure that the base image is built first. This is useful e.g. when you want to build a prod and a
# dev/testing variant of the image in your pipeline.
dependencies: [ build.base-image ]
spec:
  buildArgs:
    baseImageVersion: ${actions.build.base-image.version}
```

{% hint style="warning" %}
When using the Remote Container Builder, builds that reference other Build actions as base images (via build args used in `FROM` instructions) require a remote container registry to be configured. Without one, the remote builder cannot resolve the locally-built base image. See [Known Limitations](./using-remote-container-builder.md#known-limitations) for details.
{% endhint %}

Additionally, Garden automatically sets `GARDEN_ACTION_VERSION` as a build argument, which you can use to reference the
version of action being built. You use it internally as
a [Docker buildArg](https://docs.docker.com/engine/reference/commandline/build/#build-arg). For instance, to set
versions, render docs, or clear caches.

### Using remote images

If you're not building the container image yourself and just need to deploy an image that already exists in a registry,
you need to specify the `image` in the `Deploy` action's `spec`:

```yaml
# garden.yml
kind: Deploy
type: container
name: redis
spec:
  image: redis:5.0.5-alpine   # <- replace with any docker image ID
```

### Doing multi-platform builds

Garden supports building container images for multiple platforms and architectures. Use the `platforms` configuration field, to configure the platforms you want to build for e.g.:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
spec:
  platforms: ["linux/amd64", "linux/arm64"]
```

Garden interacts with several local and remote builders. Currently support for multi-platform builds varies based on the builder backend.
The following build backends support multi-platform builds out of the box: [Garden Container Builder](../../reference/providers/container.md), `cluster-buildkit`, `kaniko`.

In-cluster building with `kaniko` does *not* support multi-platform builds.

The `local-docker` build backend requires some additional configurations. Docker Desktop users can enable the experimental containerd image store to also store multi-platform images locally. All other local docker solutions e.g. orbstack, podman currently need a custom buildx builder of type `docker-container`. Documemtation for both can be found here https://docs.docker.com/build/building/multi-platform.
If your local docker image store does not support storing multi-platform images, consider configuring an environment where you only build single platform images when building locally e.g.:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
spec:
  platforms:
    $if: ${environment.name == "local"}
    $then: [ "linux/amd64"]
    $else: [ "linux/amd64", "linux/arm64" ]
```

Or you can specifiy to push your locally build images to a remote registry. If you are also using a Kubernetes provider and have a `deploymentRegistry` defined, the image will be pushed to this registry by default. If you are using garden only for building with the container provider, you can achieve the same behavior by specifying `--push` as an extra flag in your container action and setting `localId` to your registry name.

### Publishing images

You can publish images that have been built in your cluster using the `garden publish` command.

Unless you're publishing to your configured deployment registry (when using the `kubernetes` provider), you need to
specify the `publishId` field on the `container` action's `spec` in question to indicate where the image should be
published. For example:

```yaml
kind: Build
name: my-build
type: container
spec:
  publishId: my-repo/my-image:v1.2.3   # <- if you omit the tag here, the Garden action version will be used by default
```

By default, we use the tag specified in the `container` action's `spec.publishId` field. If none is set,
we default to the corresponding `Build` action's version.

You can also set the `--tag` option on the `garden publish` command to override the tag used for images. You can both
set a specific tag or you can _use template strings for the tag_. For example, you can

- Set a specific tag on all published builds: `garden publish --tag "v1.2.3"`
- Set a custom prefix on tags but include the Garden version hash: `garden publish --tag 'v0.1-${build.hash}'`
- Set a custom prefix on tags with the current git branch: `garden publish --tag 'v0.1-${git.branch}'`

{% hint style="warning" %}
Note that you most likely need to wrap templated tags with single quotes, to prevent your shell from attempting to perform its own substitution.
{% endhint %}

Generally, you can use any template strings available for action configs for the tags, with the addition of the
following:

- `${build.name}` — the name of the build being tagged
- `${build.version}` — the full Garden version of the build being tagged, e.g. `v-abcdef1234`
- `${build.hash}` — the Garden version hash of the build being tagged, e.g. `abcdef1234` (i.e. without the `v-`
  prefix)
