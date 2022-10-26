---
title: "`kubernetes` Provider"
tocTitle: "`kubernetes`"
---

# `kubernetes` Provider

## Description

The `kubernetes` provider allows you to deploy [`container` modules](../module-types/container.md) to
Kubernetes clusters, and adds the [`helm`](../module-types/helm.md) and
[`kubernetes`](../module-types/kubernetes.md) module types.

For usage information, please refer to the [guides section](https://docs.garden.io/guides). A good place to start is
the [Remote Kubernetes guide](../../guides/remote-kubernetes.md) guide if you're connecting to remote clusters.
The [Getting Started](../../getting-started/0-introduction.md) guide is also helpful as an introduction.

Note that if you're using a local Kubernetes cluster (e.g. minikube or Docker Desktop), the [local-kubernetes provider](./local-kubernetes.md) simplifies (and automates) the configuration and setup quite a bit.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # List other providers that should be resolved before this one.
    dependencies: []

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    # Choose the mechanism for building container images before deploying. By default your local Docker daemon is
    # used, but you can set it to `cluster-buildkit` or `kaniko` to sync files to the cluster, and build container
    # images there. This removes the need to run Docker locally, and allows you to share layer and image caches
    # between multiple developers, as well as between your development and CI workflows.
    #
    # For more details on all the different options and what makes sense to use for your setup, please check out the
    # [in-cluster building guide](https://docs.garden.io/guides/in-cluster-building).
    buildMode: local-docker

    # Configuration options for the `cluster-buildkit` build mode.
    clusterBuildkit: {}
      # Use the `cache` configuration to customize the default cluster-buildkit cache behaviour.
      #
      # The default value is:
      # clusterBuildkit:
      #   cache:
      #     - type: registry
      #       mode: auto
      #
      # For every build, this will
      # - import cached layers from a docker image tag named `_buildcache`
      # - when the build is finished, upload cache information to `_buildcache`
      #
      # For registries that support it, `mode: auto` (the default) will enable the buildkit `mode=max`
      # option.
      #
      # See the following table for details on our detection mechanism:
      #
      # | Registry Name                   | Registry Domain         | Assumed `mode=max` support |
      # |---------------------------------|-------------------------|------------------------------|
      # | Google Cloud Artifact Registry  | `pkg.dev`             | Yes                          |
      # | Azure Container Registry        | `azurecr.io`          | Yes                          |
      # | GitHub Container Registry       | `ghcr.io`             | Yes                          |
      # | DockerHub                       | `hub.docker.com`     | Yes                          |
      # | Any other registry              |                         | No                           |
      #
      # In case you need to override the defaults for your registry, you can do it like so:
      #
      # clusterBuildkit:
      #   cache:
      #     - type: registry
      #       mode: max
      #
      # When you add multiple caches, we will make sure to pass the `--import-cache` options to buildkit in the same
      # order as provided in the cache configuration. This is because buildkit will not actually use all imported
      # caches
      # for every build, but it will stick with the first cache that yields a cache hit for all the following layers.
      #
      # An example for this is the following:
      #
      # clusterBuildkit:
      #   cache:
      #     - type: registry
      #       tag: _buildcache-${slice(kebabCase(git.branch), "0", "30")}
      #     - type: registry
      #       tag: _buildcache-main
      #       export: false
      #
      # Using this cache configuration, every build will first look for a cache specific to your feature branch.
      # If it does not exist yet, it will import caches from the main branch builds (`_buildcache-main`).
      # When the build is finished, it will only export caches to your feature branch, and avoid polluting the `main`
      # branch caches.
      # A configuration like that may improve your cache hit rate and thus save time.
      #
      # If you need to disable caches completely you can achieve that with the following configuration:
      #
      # clusterBuildkit:
      #   cache: []
      cache:
        - # Use the Docker registry configured at `deploymentRegistry` to retrieve and store buildkit cache
          # information.
          #
          # See also the [buildkit registry cache
          # documentation](https://github.com/moby/buildkit#registry-push-image-and-cache-separately)
          type:

          # The registry from which the cache should be imported from, or which it should be exported to.
          #
          # If not specified, use the configured `deploymentRegistry` in your kubernetes provider config.
          #
          # Important: You must make sure `imagePullSecrets` includes authentication with the specified cache
          # registry, that has the appropriate write privileges (usually full write access to the configured
          # `namespace`).
          registry:
            # The hostname (and optionally port, if not the default port) of the registry.
            hostname:

            # The port where the registry listens on, if not the default.
            port:

            # The registry namespace. Will be placed between hostname and image name, like so:
            # <hostname>/<namespace>/<image name>
            namespace: _

            # Set to true to allow insecure connections to the registry (without SSL).
            insecure: false

          # This is the buildkit cache mode to be used.
          #
          # The value `inline` ensures that garden is using the buildkit option `--export-cache inline`. Cache
          # information will be inlined and co-located with the Docker image itself.
          #
          # The values `min` and `max` ensure that garden passes the `mode=max` or `mode=min` modifiers to the
          # buildkit `--export-cache` option. Cache manifests will only be
          # stored stored in the configured `tag`.
          #
          # `auto` is the same as `max` for some registries that are known to support it. Garden will fall back to
          # `inline` for all other registries.
          #  See the [clusterBuildkit cache option](#providers-.clusterbuildkit.cache) for a description of the
          # detection mechanism.
          #
          # See also the [buildkit export cache documentation](https://github.com/moby/buildkit#export-cache)
          mode: auto

          # This is the Docker registry tag name buildkit should use for the registry build cache. Default is
          # `_buildcache`
          #
          # **NOTE**: `tag` can only be used together with the `registry` cache type
          tag: _buildcache

          # If this is false, only pass the `--import-cache` option to buildkit, and not the `--export-cache` option.
          # Defaults to true.
          export: true

      # Enable rootless mode for the cluster-buildkit daemon, which runs the daemon with decreased privileges.
      # Please see [the buildkit docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md) for caveats when
      # using this mode.
      rootless: false

      # Exposes the `nodeSelector` field on the PodSpec of the BuildKit deployment. This allows you to constrain the
      # BuildKit daemon to only run on particular nodes.
      #
      # [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes
      # guide to assigning Pods to nodes.
      nodeSelector: {}

      # Specify tolerations to apply to cluster-buildkit daemon. Useful to control which nodes in a cluster can run
      # builds.
      tolerations:
        - # "Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
          # allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".
          effect:

          # "Key" is the taint key that the toleration applies to. Empty means match all taint keys.
          # If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.
          key:

          # "Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal".
          # Defaults to
          # "Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
          # particular category.
          operator: Equal

          # "TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
          # otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
          # the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
          # by the system.
          tolerationSeconds:

          # "Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be
          # empty,
          # otherwise just a regular string.
          value:

    # Setting related to Jib image builds.
    jib:
      # In some cases you may need to push images built with Jib to the remote registry via Kubernetes cluster, e.g.
      # if you don't have connectivity or access from where Garden is being run. In that case, set this flag to true,
      # but do note that the build will take considerably take longer to complete! Only applies when using in-cluster
      # building.
      pushViaCluster: false

    # Configuration options for the `kaniko` build mode.
    kaniko:
      # Specify extra flags to use when building the container image with kaniko. Flags set on `container` modules
      # take precedence over these.
      extraFlags:

      # Change the kaniko image (repository/image:tag) to use when building in kaniko mode.
      image: 'gcr.io/kaniko-project/executor:v1.8.1-debug'

      # Choose the namespace where the Kaniko pods will be run. Set to `null` to use the project namespace.
      #
      # **IMPORTANT: The default namespace will change to the project namespace instead of the garden-system namespace
      # in an upcoming release!**
      namespace: garden-system

      # Exposes the `nodeSelector` field on the PodSpec of the Kaniko pods. This allows you to constrain the Kaniko
      # pods to only run on particular nodes.
      #
      # [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes
      # guide to assigning Pods to nodes.
      nodeSelector:

      # Specify tolerations to apply to each Kaniko Pod. Useful to control which nodes in a cluster can run builds.
      tolerations:
        - # "Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
          # allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".
          effect:

          # "Key" is the taint key that the toleration applies to. Empty means match all taint keys.
          # If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.
          key:

          # "Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal".
          # Defaults to
          # "Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
          # particular category.
          operator: Equal

          # "TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
          # otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
          # the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
          # by the system.
          tolerationSeconds:

          # "Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be
          # empty,
          # otherwise just a regular string.
          value:

    # A default hostname to use when no hostname is explicitly configured for a service.
    defaultHostname:

    # Sets the deployment strategy for `container` services.
    #
    # The default is `"rolling"`, which performs rolling updates. There is also experimental support for blue/green
    # deployments (via the `"blue-green"` strategy).
    #
    # Note that this setting only applies to `container` services (and not, for example,  `kubernetes` or `helm`
    # services).
    deploymentStrategy: rolling

    # Configuration options for dev mode.
    devMode:
      # Specifies default settings for dev mode syncs (e.g. for `container`, `kubernetes` and `helm` services).
      #
      # These are overridden/extended by the settings of any individual dev mode sync specs.
      #
      # Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden
      # deploy` command.
      #
      # See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more
      # information.
      defaults:
        # Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.
        #
        # Any exclusion patterns defined in individual dev mode sync specs will be applied in addition to these
        # patterns.
        #
        # `.git` directories and `.garden` directories are always ignored.
        exclude:

        # The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600
        # (user read/write). See the [Mutagen
        # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
        fileMode:

        # The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to
        # 0700 (user read/write). See the [Mutagen
        # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
        directoryMode:

        # Set the default owner of files and directories at the target. Specify either an integer ID or a string name.
        # See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for
        # more information.
        owner:

        # Set the default group on files and directories at the target. Specify either an integer ID or a string name.
        # See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for
        # more information.
        group:

    # Require SSL on all `container` module services. If set to true, an error is raised when no certificate is
    # available for a configured hostname on a `container` module.
    forceSsl: false

    # References to `docker-registry` secrets to use for authenticating with remote registries when pulling
    # images. This is necessary if you reference private images in your module configuration, and is required
    # when configuring a remote Kubernetes environment with buildMode=local.
    imagePullSecrets:
      - # The name of the Kubernetes secret.
        name:

        # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
        # namespace before use.
        namespace: default

    # References to secrets you need to have copied into all namespaces deployed to. These secrets will be
    # ensured to exist in the namespace before deploying any service.
    copySecrets:
      - # The name of the Kubernetes secret.
        name:

        # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
        # namespace before use.
        namespace: default

    # Resource requests and limits for the in-cluster builder..
    resources:
      # Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're
      # using when configuring this.
      #
      # When `buildMode` is `kaniko`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to
      # consider the requirements for your individual image builds, with your most expensive/heavy images in mind.
      #
      # When `buildMode` is `cluster-buildkit`, this applies to the BuildKit deployment created in _each project
      # namespace_. So think of this as the resource spec for each individual user or project namespace.
      builder:
        limits:
          # CPU limit in millicpu.
          cpu: 4000

          # Memory limit in megabytes.
          memory: 8192

          # Ephemeral storage limit in megabytes.
          ephemeralStorage:

        requests:
          # CPU request in millicpu.
          cpu: 100

          # Memory request in megabytes.
          memory: 512

          # Ephemeral storage request in megabytes.
          ephemeralStorage:

    # One or more certificates to use for ingress.
    tlsCertificates:
      - # A unique identifier for this certificate.
        name:

        # A list of hostnames that this certificate should be used for. If you don't specify these, they will be
        # automatically read from the certificate.
        hostnames:

        # A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.
        secretRef:
          # The name of the Kubernetes secret.
          name:

          # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
          # namespace before use.
          namespace: default

        # Set to `cert-manager` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
        # certificate. See our
        # [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
        managedBy:

    # cert-manager configuration, for creating and managing TLS certificates. See the
    # [cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
    certManager:
      # Automatically install `cert-manager` on initialization. See the
      # [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
      install: false

      # The email to use when requesting Let's Encrypt certificates.
      email:

      # The type of issuer for the certificate (only ACME is supported for now).
      issuer: acme

      # Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod servers are
      # supported.
      acmeServer: letsencrypt-staging

      # The type of ACME challenge used to validate hostnames and generate the certificates (only HTTP-01 is supported
      # for now).
      acmeChallengeType: HTTP-01

    # Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain the system
    # services to only run on particular nodes.
    #
    # [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide
    # to assigning Pods to nodes.
    systemNodeSelector: {}

    # The name of the provider plugin to use.
    name: kubernetes

    # The kubectl context to use to connect to the Kubernetes cluster.
    context:

    # The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.
    #
    # Important: If you specify this in combination with in-cluster building, you must make sure `imagePullSecrets`
    # includes authentication with the specified deployment registry, that has the appropriate write privileges
    # (usually full write access to the configured `deploymentRegistry.namespace`).
    deploymentRegistry:
      # The hostname (and optionally port, if not the default port) of the registry.
      hostname:

      # The port where the registry listens on, if not the default.
      port:

      # The registry namespace. Will be placed between hostname and image name, like so: <hostname>/<namespace>/<image
      # name>
      namespace: _

      # Set to true to allow insecure connections to the registry (without SSL).
      insecure: false

    # The ingress class to use on configured Ingresses (via the `kubernetes.io/ingress.class` annotation)
    # when deploying `container` services. Use this if you have multiple ingress controllers in your cluster.
    ingressClass:

    # The external HTTP port of the cluster's ingress controller.
    ingressHttpPort: 80

    # The external HTTPS port of the cluster's ingress controller.
    ingressHttpsPort: 443

    # Path to kubeconfig file to use instead of the system default.
    kubeconfig:

    # Set a specific path to a kubectl binary, instead of having Garden download it automatically as required.
    #
    # It may be useful in some scenarios to allow individual users to set this, e.g. with an environment variable. You
    # could configure that with something like `kubectlPath: ${local.env.GARDEN_KUBECTL_PATH}?`.
    #
    # **Warning**: Garden may make some assumptions with respect to the kubectl version, so it is suggested to only
    # use this when necessary.
    kubectlPath:

    # Specify which namespace to deploy services to, and optionally annotations/labels to apply to the namespace.
    #
    # You can specify a string as a shorthand for `name: <name>`. Defaults to `<project name>-<environment
    # namespace>`.
    #
    # Note that the framework may generate other namespaces as well with this name as a prefix. Also note that if the
    # namespace previously exists, Garden will attempt to add the specified labels and annotations. If the user does
    # not have permissions to do so, a warning is shown.
    namespace:
      # A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters,
      # numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63
      # characters.
      name:

      # Map of annotations to apply to the namespace when creating it.
      annotations:

      # Map of labels to apply to the namespace when creating it.
      labels:

    # Set this to `nginx` to install/enable the NGINX ingress controller.
    setupIngressController: false
```
## Configuration Keys

### `providers[]`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].dependencies[]`

[providers](#providers) > dependencies

List other providers that should be resolved before this one.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
providers:
  - dependencies:
      - exec
```

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
providers:
  - environments:
      - dev
      - stage
```

### `providers[].buildMode`

[providers](#providers) > buildMode

Choose the mechanism for building container images before deploying. By default your local Docker daemon is used, but you can set it to `cluster-buildkit` or `kaniko` to sync files to the cluster, and build container images there. This removes the need to run Docker locally, and allows you to share layer and image caches between multiple developers, as well as between your development and CI workflows.

For more details on all the different options and what makes sense to use for your setup, please check out the [in-cluster building guide](https://docs.garden.io/guides/in-cluster-building).

| Type     | Allowed Values                               | Default          | Required |
| -------- | -------------------------------------------- | ---------------- | -------- |
| `string` | "local-docker", "kaniko", "cluster-buildkit" | `"local-docker"` | Yes      |

### `providers[].clusterBuildkit`

[providers](#providers) > clusterBuildkit

Configuration options for the `cluster-buildkit` build mode.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `providers[].clusterBuildkit.cache[]`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > cache

Use the `cache` configuration to customize the default cluster-buildkit cache behaviour.

The default value is:
```yaml
clusterBuildkit:
  cache:
    - type: registry
      mode: auto
```

For every build, this will
- import cached layers from a docker image tag named `_buildcache`
- when the build is finished, upload cache information to `_buildcache`

For registries that support it, `mode: auto` (the default) will enable the buildkit `mode=max`
option.

See the following table for details on our detection mechanism:

| Registry Name                   | Registry Domain         | Assumed `mode=max` support |
|---------------------------------|-------------------------|------------------------------|
| Google Cloud Artifact Registry  | `pkg.dev`             | Yes                          |
| Azure Container Registry        | `azurecr.io`          | Yes                          |
| GitHub Container Registry       | `ghcr.io`             | Yes                          |
| DockerHub                       | `hub.docker.com`     | Yes                          |
| Any other registry              |                         | No                           |

In case you need to override the defaults for your registry, you can do it like so:

```yaml
clusterBuildkit:
  cache:
    - type: registry
      mode: max
```

When you add multiple caches, we will make sure to pass the `--import-cache` options to buildkit in the same
order as provided in the cache configuration. This is because buildkit will not actually use all imported caches
for every build, but it will stick with the first cache that yields a cache hit for all the following layers.

An example for this is the following:

```yaml
clusterBuildkit:
  cache:
    - type: registry
      tag: _buildcache-${slice(kebabCase(git.branch), "0", "30")}
    - type: registry
      tag: _buildcache-main
      export: false
```

Using this cache configuration, every build will first look for a cache specific to your feature branch.
If it does not exist yet, it will import caches from the main branch builds (`_buildcache-main`).
When the build is finished, it will only export caches to your feature branch, and avoid polluting the `main` branch caches.
A configuration like that may improve your cache hit rate and thus save time.

If you need to disable caches completely you can achieve that with the following configuration:

```yaml
clusterBuildkit:
  cache: []
```

| Type            | Default                                                                 | Required |
| --------------- | ----------------------------------------------------------------------- | -------- |
| `array[object]` | `[{"type":"registry","mode":"auto","tag":"_buildcache","export":true}]` | No       |

### `providers[].clusterBuildkit.cache[].type`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > type

Use the Docker registry configured at `deploymentRegistry` to retrieve and store buildkit cache information.

See also the [buildkit registry cache documentation](https://github.com/moby/buildkit#registry-push-image-and-cache-separately)

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "registry"     | Yes      |

### `providers[].clusterBuildkit.cache[].registry`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > registry

The registry from which the cache should be imported from, or which it should be exported to.

If not specified, use the configured `deploymentRegistry` in your kubernetes provider config.

Important: You must make sure `imagePullSecrets` includes authentication with the specified cache registry, that has the appropriate write privileges (usually full write access to the configured `namespace`).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterBuildkit.cache[].registry.hostname`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > [registry](#providersclusterbuildkitcacheregistry) > hostname

The hostname (and optionally port, if not the default port) of the registry.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - clusterBuildkit:
      ...
      cache:
        - registry:
            ...
            hostname: "gcr.io"
```

### `providers[].clusterBuildkit.cache[].registry.port`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > [registry](#providersclusterbuildkitcacheregistry) > port

The port where the registry listens on, if not the default.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `providers[].clusterBuildkit.cache[].registry.namespace`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > [registry](#providersclusterbuildkitcacheregistry) > namespace

The registry namespace. Will be placed between hostname and image name, like so: <hostname>/<namespace>/<image name>

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"_"`   | No       |

Example:

```yaml
providers:
  - clusterBuildkit:
      ...
      cache:
        - registry:
            ...
            namespace: "my-project"
```

### `providers[].clusterBuildkit.cache[].registry.insecure`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > [registry](#providersclusterbuildkitcacheregistry) > insecure

Set to true to allow insecure connections to the registry (without SSL).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].clusterBuildkit.cache[].mode`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > mode

This is the buildkit cache mode to be used.

The value `inline` ensures that garden is using the buildkit option `--export-cache inline`. Cache information will be inlined and co-located with the Docker image itself.

The values `min` and `max` ensure that garden passes the `mode=max` or `mode=min` modifiers to the buildkit `--export-cache` option. Cache manifests will only be
stored stored in the configured `tag`.

`auto` is the same as `max` for some registries that are known to support it. Garden will fall back to `inline` for all other registries.
 See the [clusterBuildkit cache option](#providers-.clusterbuildkit.cache) for a description of the detection mechanism.

See also the [buildkit export cache documentation](https://github.com/moby/buildkit#export-cache)

| Type     | Allowed Values                 | Default  | Required |
| -------- | ------------------------------ | -------- | -------- |
| `string` | "auto", "min", "max", "inline" | `"auto"` | Yes      |

### `providers[].clusterBuildkit.cache[].tag`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > tag

This is the Docker registry tag name buildkit should use for the registry build cache. Default is `_buildcache`

**NOTE**: `tag` can only be used together with the `registry` cache type

| Type     | Default         | Required |
| -------- | --------------- | -------- |
| `string` | `"_buildcache"` | No       |

### `providers[].clusterBuildkit.cache[].export`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [cache](#providersclusterbuildkitcache) > export

If this is false, only pass the `--import-cache` option to buildkit, and not the `--export-cache` option. Defaults to true.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `providers[].clusterBuildkit.rootless`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > rootless

Enable rootless mode for the cluster-buildkit daemon, which runs the daemon with decreased privileges.
Please see [the buildkit docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md) for caveats when using this mode.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].clusterBuildkit.nodeSelector`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > nodeSelector

Exposes the `nodeSelector` field on the PodSpec of the BuildKit deployment. This allows you to constrain the BuildKit daemon to only run on particular nodes.

[See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
providers:
  - clusterBuildkit:
      ...
      nodeSelector:
          disktype: ssd
```

### `providers[].clusterBuildkit.tolerations[]`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > tolerations

Specify tolerations to apply to cluster-buildkit daemon. Useful to control which nodes in a cluster can run builds.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].clusterBuildkit.tolerations[].effect`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [tolerations](#providersclusterbuildkittolerations) > effect

"Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterBuildkit.tolerations[].key`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [tolerations](#providersclusterbuildkittolerations) > key

"Key" is the taint key that the toleration applies to. Empty means match all taint keys.
If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterBuildkit.tolerations[].operator`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [tolerations](#providersclusterbuildkittolerations) > operator

"Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults to
"Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
particular category.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"Equal"` | No       |

### `providers[].clusterBuildkit.tolerations[].tolerationSeconds`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [tolerations](#providersclusterbuildkittolerations) > tolerationSeconds

"TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
by the system.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterBuildkit.tolerations[].value`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > [tolerations](#providersclusterbuildkittolerations) > value

"Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be empty,
otherwise just a regular string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].jib`

[providers](#providers) > jib

Setting related to Jib image builds.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].jib.pushViaCluster`

[providers](#providers) > [jib](#providersjib) > pushViaCluster

In some cases you may need to push images built with Jib to the remote registry via Kubernetes cluster, e.g. if you don't have connectivity or access from where Garden is being run. In that case, set this flag to true, but do note that the build will take considerably take longer to complete! Only applies when using in-cluster building.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].kaniko`

[providers](#providers) > kaniko

Configuration options for the `kaniko` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.extraFlags[]`

[providers](#providers) > [kaniko](#providerskaniko) > extraFlags

Specify extra flags to use when building the container image with kaniko. Flags set on `container` modules take precedence over these.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `providers[].kaniko.image`

[providers](#providers) > [kaniko](#providerskaniko) > image

Change the kaniko image (repository/image:tag) to use when building in kaniko mode.

| Type     | Default                                         | Required |
| -------- | ----------------------------------------------- | -------- |
| `string` | `"gcr.io/kaniko-project/executor:v1.8.1-debug"` | No       |

### `providers[].kaniko.namespace`

[providers](#providers) > [kaniko](#providerskaniko) > namespace

Choose the namespace where the Kaniko pods will be run. Set to `null` to use the project namespace.

**IMPORTANT: The default namespace will change to the project namespace instead of the garden-system namespace in an upcoming release!**

| Type     | Default           | Required |
| -------- | ----------------- | -------- |
| `string` | `"garden-system"` | No       |

### `providers[].kaniko.nodeSelector`

[providers](#providers) > [kaniko](#providerskaniko) > nodeSelector

Exposes the `nodeSelector` field on the PodSpec of the Kaniko pods. This allows you to constrain the Kaniko pods to only run on particular nodes.

[See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.tolerations[]`

[providers](#providers) > [kaniko](#providerskaniko) > tolerations

Specify tolerations to apply to each Kaniko Pod. Useful to control which nodes in a cluster can run builds.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].kaniko.tolerations[].effect`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > effect

"Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.tolerations[].key`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > key

"Key" is the taint key that the toleration applies to. Empty means match all taint keys.
If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.tolerations[].operator`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > operator

"Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults to
"Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
particular category.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"Equal"` | No       |

### `providers[].kaniko.tolerations[].tolerationSeconds`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > tolerationSeconds

"TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
by the system.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.tolerations[].value`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > value

"Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be empty,
otherwise just a regular string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].defaultHostname`

[providers](#providers) > defaultHostname

A default hostname to use when no hostname is explicitly configured for a service.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - defaultHostname: "api.mydomain.com"
```

### `providers[].deploymentStrategy`

[providers](#providers) > deploymentStrategy

{% hint style="warning" %}
**Experimental**: this is an experimental feature and the API might change in the future.
{% endhint %}

Sets the deployment strategy for `container` services.

The default is `"rolling"`, which performs rolling updates. There is also experimental support for blue/green deployments (via the `"blue-green"` strategy).

Note that this setting only applies to `container` services (and not, for example,  `kubernetes` or `helm` services).

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"rolling"` | No       |

### `providers[].devMode`

[providers](#providers) > devMode

Configuration options for dev mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].devMode.defaults`

[providers](#providers) > [devMode](#providersdevmode) > defaults

Specifies default settings for dev mode syncs (e.g. for `container`, `kubernetes` and `helm` services).

These are overridden/extended by the settings of any individual dev mode sync specs.

Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden deploy` command.

See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more information.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].devMode.defaults.exclude[]`

[providers](#providers) > [devMode](#providersdevmode) > [defaults](#providersdevmodedefaults) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

Any exclusion patterns defined in individual dev mode sync specs will be applied in addition to these patterns.

`.git` directories and `.garden` directories are always ignored.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
providers:
  - devMode:
      ...
      defaults:
        ...
        exclude:
          - dist/**/*
          - '*.log'
```

### `providers[].devMode.defaults.fileMode`

[providers](#providers) > [devMode](#providersdevmode) > [defaults](#providersdevmodedefaults) > fileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600 (user read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `providers[].devMode.defaults.directoryMode`

[providers](#providers) > [devMode](#providersdevmode) > [defaults](#providersdevmodedefaults) > directoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0700 (user read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `providers[].devMode.defaults.owner`

[providers](#providers) > [devMode](#providersdevmode) > [defaults](#providersdevmodedefaults) > owner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `providers[].devMode.defaults.group`

[providers](#providers) > [devMode](#providersdevmode) > [defaults](#providersdevmodedefaults) > group

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `providers[].forceSsl`

[providers](#providers) > forceSsl

Require SSL on all `container` module services. If set to true, an error is raised when no certificate is available for a configured hostname on a `container` module.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].imagePullSecrets[]`

[providers](#providers) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment with buildMode=local.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].imagePullSecrets[].name`

[providers](#providers) > [imagePullSecrets](#providersimagepullsecrets) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - imagePullSecrets:
      - name: "my-secret"
```

### `providers[].imagePullSecrets[].namespace`

[providers](#providers) > [imagePullSecrets](#providersimagepullsecrets) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].copySecrets[]`

[providers](#providers) > copySecrets

References to secrets you need to have copied into all namespaces deployed to. These secrets will be
ensured to exist in the namespace before deploying any service.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].copySecrets[].name`

[providers](#providers) > [copySecrets](#providerscopysecrets) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - copySecrets:
      - name: "my-secret"
```

### `providers[].copySecrets[].namespace`

[providers](#providers) > [copySecrets](#providerscopysecrets) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].resources`

[providers](#providers) > resources

Resource requests and limits for the in-cluster builder..

| Type     | Default                                                                                 | Required |
| -------- | --------------------------------------------------------------------------------------- | -------- |
| `object` | `{"builder":{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":100,"memory":512}}}` | No       |

### `providers[].resources.builder`

[providers](#providers) > [resources](#providersresources) > builder

Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're using when configuring this.

When `buildMode` is `kaniko`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to consider the requirements for your individual image builds, with your most expensive/heavy images in mind.

When `buildMode` is `cluster-buildkit`, this applies to the BuildKit deployment created in _each project namespace_. So think of this as the resource spec for each individual user or project namespace.

| Type     | Default                                                                     | Required |
| -------- | --------------------------------------------------------------------------- | -------- |
| `object` | `{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":100,"memory":512}}` | No       |

### `providers[].resources.builder.limits`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > limits

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":4000,"memory":8192}` | No       |

### `providers[].resources.builder.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > cpu

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `4000`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          cpu: 4000
```

### `providers[].resources.builder.limits.memory`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > memory

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `8192`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          memory: 8192
```

### `providers[].resources.builder.limits.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > ephemeralStorage

Ephemeral storage limit in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          ephemeralStorage: 8192
```

### `providers[].resources.builder.requests`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > requests

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":100,"memory":512}` | No       |

### `providers[].resources.builder.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `100`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          cpu: 100
```

### `providers[].resources.builder.requests.memory`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > memory

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          memory: 512
```

### `providers[].resources.builder.requests.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > ephemeralStorage

Ephemeral storage request in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          ephemeralStorage: 8192
```

### `providers[].tlsCertificates[]`

[providers](#providers) > tlsCertificates

One or more certificates to use for ingress.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].tlsCertificates[].name`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > name

A unique identifier for this certificate.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - tlsCertificates:
      - name: "www"
```

### `providers[].tlsCertificates[].hostnames[]`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > hostnames

A list of hostnames that this certificate should be used for. If you don't specify these, they will be automatically read from the certificate.

| Type              | Required |
| ----------------- | -------- |
| `array[hostname]` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - hostnames:
          - www.mydomain.com
```

### `providers[].tlsCertificates[].secretRef`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > secretRef

A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - secretRef:
            name: my-tls-secret
            namespace: default
```

### `providers[].tlsCertificates[].secretRef.name`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > [secretRef](#providerstlscertificatessecretref) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - tlsCertificates:
      - secretRef:
            name: my-tls-secret
            namespace: default
          ...
          name: "my-secret"
```

### `providers[].tlsCertificates[].secretRef.namespace`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > [secretRef](#providerstlscertificatessecretref) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].tlsCertificates[].managedBy`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > managedBy

Set to `cert-manager` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
certificate. See our
[cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - managedBy: "cert-manager"
```

### `providers[].certManager`

[providers](#providers) > certManager

cert-manager configuration, for creating and managing TLS certificates. See the
[cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].certManager.install`

[providers](#providers) > [certManager](#providerscertmanager) > install

Automatically install `cert-manager` on initialization. See the
[cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].certManager.email`

[providers](#providers) > [certManager](#providerscertmanager) > email

The email to use when requesting Let's Encrypt certificates.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - certManager:
      ...
      email: "yourname@example.com"
```

### `providers[].certManager.issuer`

[providers](#providers) > [certManager](#providerscertmanager) > issuer

The type of issuer for the certificate (only ACME is supported for now).

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"acme"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      issuer: "acme"
```

### `providers[].certManager.acmeServer`

[providers](#providers) > [certManager](#providerscertmanager) > acmeServer

Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod servers are supported.

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `string` | `"letsencrypt-staging"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      acmeServer: "letsencrypt-staging"
```

### `providers[].certManager.acmeChallengeType`

[providers](#providers) > [certManager](#providerscertmanager) > acmeChallengeType

The type of ACME challenge used to validate hostnames and generate the certificates (only HTTP-01 is supported for now).

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"HTTP-01"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      acmeChallengeType: "HTTP-01"
```

### `providers[].systemNodeSelector`

[providers](#providers) > systemNodeSelector

Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain the system services to only run on particular nodes.

[See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
providers:
  - systemNodeSelector:
        disktype: ssd
```

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Default        | Required |
| -------- | -------------- | -------- |
| `string` | `"kubernetes"` | Yes      |

Example:

```yaml
providers:
  - name: "kubernetes"
```

### `providers[].context`

[providers](#providers) > context

The kubectl context to use to connect to the Kubernetes cluster.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - context: "my-dev-context"
```

### `providers[].deploymentRegistry`

[providers](#providers) > deploymentRegistry

The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

Important: If you specify this in combination with in-cluster building, you must make sure `imagePullSecrets` includes authentication with the specified deployment registry, that has the appropriate write privileges (usually full write access to the configured `deploymentRegistry.namespace`).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].deploymentRegistry.hostname`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > hostname

The hostname (and optionally port, if not the default port) of the registry.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - deploymentRegistry:
      ...
      hostname: "gcr.io"
```

### `providers[].deploymentRegistry.port`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > port

The port where the registry listens on, if not the default.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `providers[].deploymentRegistry.namespace`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > namespace

The registry namespace. Will be placed between hostname and image name, like so: <hostname>/<namespace>/<image name>

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"_"`   | No       |

Example:

```yaml
providers:
  - deploymentRegistry:
      ...
      namespace: "my-project"
```

### `providers[].deploymentRegistry.insecure`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > insecure

Set to true to allow insecure connections to the registry (without SSL).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].ingressClass`

[providers](#providers) > ingressClass

The ingress class to use on configured Ingresses (via the `kubernetes.io/ingress.class` annotation)
when deploying `container` services. Use this if you have multiple ingress controllers in your cluster.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].ingressHttpPort`

[providers](#providers) > ingressHttpPort

The external HTTP port of the cluster's ingress controller.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `80`    | No       |

### `providers[].ingressHttpsPort`

[providers](#providers) > ingressHttpsPort

The external HTTPS port of the cluster's ingress controller.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `443`   | No       |

### `providers[].kubeconfig`

[providers](#providers) > kubeconfig

Path to kubeconfig file to use instead of the system default.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kubectlPath`

[providers](#providers) > kubectlPath

Set a specific path to a kubectl binary, instead of having Garden download it automatically as required.

It may be useful in some scenarios to allow individual users to set this, e.g. with an environment variable. You could configure that with something like `kubectlPath: ${local.env.GARDEN_KUBECTL_PATH}?`.

**Warning**: Garden may make some assumptions with respect to the kubectl version, so it is suggested to only use this when necessary.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].namespace`

[providers](#providers) > namespace

Specify which namespace to deploy services to, and optionally annotations/labels to apply to the namespace.

You can specify a string as a shorthand for `name: <name>`. Defaults to `<project name>-<environment namespace>`.

Note that the framework may generate other namespaces as well with this name as a prefix. Also note that if the namespace previously exists, Garden will attempt to add the specified labels and annotations. If the user does not have permissions to do so, a warning is shown.

| Type               | Required |
| ------------------ | -------- |
| `object \| string` | No       |

### `providers[].namespace.name`

[providers](#providers) > [namespace](#providersnamespace) > name

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].namespace.annotations`

[providers](#providers) > [namespace](#providersnamespace) > annotations

Map of annotations to apply to the namespace when creating it.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].namespace.labels`

[providers](#providers) > [namespace](#providersnamespace) > labels

Map of labels to apply to the namespace when creating it.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].setupIngressController`

[providers](#providers) > setupIngressController

Set this to `nginx` to install/enable the NGINX ingress controller.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `false` | No       |


## Outputs

The following keys are available via the `${providers.<provider-name>}` template string key for `kubernetes` providers.

### `${providers.<provider-name>.outputs.app-namespace}`

The primary namespace used for resource deployments.

| Type     |
| -------- |
| `string` |

### `${providers.<provider-name>.outputs.default-hostname}`

The default hostname configured on the provider.

| Type     |
| -------- |
| `string` |
