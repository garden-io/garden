---
title: "`kubernetes-pod` Run"
tocTitle: "`kubernetes-pod` Run"
---

# `kubernetes-pod` Run

## Description

Executes a Run in an ad-hoc instance of a Kubernetes Pod and waits for it to complete.

The pod spec can be provided directly via the `podSpec` field, or the `resource` field can be used to find the pod spec in the Kubernetes manifests provided via the `files` and/or `manifests` fields.

Below is the full schema reference for the action. For an introduction to configuring Garden, please look at our [Configuration
guide](../../../using-garden/configuration-overview.md).

`kubernetes-pod` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Configuration Keys

### `type`

The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be defined by your configured providers.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `name`

A valid name for the action. Must be unique across all actions of the same _kind_ in your project.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `description`

A description of the action.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `source`

By default, the directory where the action is defined is used as the source for the build context.

You can override the directory that is used for the build context by setting `source.path`.

You can use `source.repository` to get the source from an external repository. For more information on remote actions, please refer to the [Remote Sources guide](https://docs.garden.io/bonsai-0.13/advanced/using-remote-sources).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.path`

[source](#source) > path

A relative POSIX-style path to the source directory for this action.

If specified together with `source.repository`, the path will be relative to the repository root.

Otherwise, the path will be relative to the directory containing the Garden configuration file.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `source.repository`

[source](#source) > repository

When set, Garden will import the action source from this repository, but use this action configuration (and not scan for configs in the separate repository).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.repository.url`

[source](#source) > [repository](#sourcerepository) > url

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | Yes      |

Example:

```yaml
source:
  ...
  repository:
    ...
    url: "git+https://github.com/org/repo.git#v2.0"
```

### `dependencies[]`

A list of other actions that this action depends on, and should be built, deployed or run (depending on the action type) before processing this action.

Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`, `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.

You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.

Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via template expressions.

| Type                     | Default | Required |
| ------------------------ | ------- | -------- |
| `array[actionReference]` | `[]`    | No       |

Example:

```yaml
dependencies:
  - build.my-image
  - deploy.api
```

### `disabled`

Set this to `true` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `environments[]`

If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is equivalent to `disabled: ${environment.name != "prod"}`.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

_Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/bonsai-0.13/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
include:
  - my-app.js
  - some-assets/**/*
```

### `exclude[]`

Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/bonsai-0.13/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those, if you have large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

### `variables`

A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that order. They may reference group-scoped and project-scoped variables, and generally can use any template strings normally allowed when resolving the action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `varfiles[]`

Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level `variables` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

The format of the files is determined by the configured file's extension:

* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles exist).

If a listed varfile cannot be found, throwing an error.
To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean field.
```yaml
varfiles:
  - path: my-action.env
    optional: true
```

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[alternatives]` | `[]`    | No       |

Example:

```yaml
varfiles:
  "my-action.env"
```

### `varfiles[].path`

[varfiles](#varfiles) > path

Path to a file containing a path.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `varfiles[].optional`

[varfiles](#varfiles) > optional

Whether the varfile is optional.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `build`

{% hint style="warning" %}
**Deprecated**: The `build` config field in runtime action configs is deprecated in 0.13 and will be removed in the next major release, Garden 0.14.
Use `dependencies` config build to define the build dependencies.
{% endhint %}

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Run"          | Yes      |

### `timeout`

Set a timeout for the run to complete, in seconds.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.cacheResult`

[spec](#spec) > cacheResult

Set to false if you don't want the Run's result to be cached. Use this if the Run needs to be run any time your project (or one or more of the Run's dependants) is deployed. Otherwise the Run is only re-run when its version changes, or when you run `garden run`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.command[]`

[spec](#spec) > command

The command/entrypoint used to run inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  command:
    - /bin/sh
    - '-c'
```

### `spec.args[]`

[spec](#spec) > args

The arguments to pass to the command/entrypoint used for execution.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  args:
    - rake
    - db:migrate
```

### `spec.env`

[spec](#spec) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
spec:
  ...
  env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

### `spec.artifacts[]`

[spec](#spec) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
the `.garden/artifacts` directory.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.artifacts[].source`

[spec](#spec) > [artifacts](#specartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
spec:
  ...
  artifacts:
    - source: "/output/**/*"
```

### `spec.artifacts[].target`

[spec](#spec) > [artifacts](#specartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
spec:
  ...
  artifacts:
    - target: "outputs/foo/"
```

### `spec.namespace`

[spec](#spec) > namespace

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.kustomize`

[spec](#spec) > kustomize

Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or `manifests` as well, these are also included.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.kustomize.path`

[spec](#spec) > [kustomize](#speckustomize) > path

The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the action root. Defaults to the action root. If you set this to null, kustomize will not be run.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `posixPath \| string` | `"."`   | No       |

### `spec.kustomize.version`

[spec](#spec) > [kustomize](#speckustomize) > version

The Kustomize version to use.

| Type     | Allowed Values | Default | Required |
| -------- | -------------- | ------- | -------- |
| `number` | 4, 5           | `5`     | Yes      |

### `spec.kustomize.extraArgs[]`

[spec](#spec) > [kustomize](#speckustomize) > extraArgs

A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output' is not allowed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `spec.patchResources[]`

[spec](#spec) > patchResources

A list of resources to patch using Kubernetes' patch strategies. This is useful for e.g. overwriting a given container image name with an image built by Garden
without having to actually modify the underlying Kubernetes manifest in your source code. Another common example is to use this to change the number of replicas for a given
Kubernetes Deployment.

Under the hood, Garden just applies the `kubectl patch` command to the resource that matches the specified `kind` and `name`.

Patches are applied to file manifests, inline manifests, and kustomize files.

You can learn more about patching Kubernetes resources here: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.patchResources[].kind`

[spec](#spec) > [patchResources](#specpatchresources) > kind

The kind of the resource to patch.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.patchResources[].name`

[spec](#spec) > [patchResources](#specpatchresources) > name

The name of the resource to patch.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.patchResources[].strategy`

[spec](#spec) > [patchResources](#specpatchresources) > strategy

The patch strategy to use. One of 'json', 'merge', or 'strategic'. Defaults to 'strategic'.

You can read more about the different strategies in the offical Kubernetes documentation at:
https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/

| Type     | Default       | Required |
| -------- | ------------- | -------- |
| `string` | `"strategic"` | No       |

### `spec.patchResources[].patch`

[spec](#spec) > [patchResources](#specpatchresources) > patch

The patch to apply.

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `spec.manifests[]`

[spec](#spec) > manifests

List of Kubernetes resource manifests to be searched (using `resource`e for the pod spec for the Run. If `files` is also specified, this is combined with the manifests read from the files.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.manifests[].apiVersion`

[spec](#spec) > [manifests](#specmanifests) > apiVersion

The API version of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.manifests[].kind`

[spec](#spec) > [manifests](#specmanifests) > kind

The kind of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.manifests[].metadata`

[spec](#spec) > [manifests](#specmanifests) > metadata

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `spec.manifests[].metadata.name`

[spec](#spec) > [manifests](#specmanifests) > [metadata](#specmanifestsmetadata) > name

The name of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.files[]`

[spec](#spec) > files

POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before searching the manifests for the resource that contains the Pod spec for the Run.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `spec.resource`

[spec](#spec) > resource

Specify a Kubernetes resource to derive the Pod spec from for the Run.

This resource will be selected from the manifests provided in this Run's `files` or `manifests` config field.

The following fields from the Pod will be used (if present) when executing the Run:

**Warning**: Garden will retain `configMaps` and `secrets` as volumes, but remove `persistentVolumeClaim` volumes from the Pod spec, as they might already be mounted.
* `affinity`
* `automountServiceAccountToken`
* `containers`
* `dnsConfig`
* `dnsPolicy`
* `enableServiceLinks`
* `hostAliases`
* `hostIPC`
* `hostNetwork`
* `hostPID`
* `hostname`
* `imagePullSecrets`
* `nodeName`
* `nodeSelector`
* `overhead`
* `preemptionPolicy`
* `priority`
* `priorityClassName`
* `runtimeClassName`
* `schedulerName`
* `securityContext`
* `serviceAccount`
* `serviceAccountName`
* `shareProcessNamespace`
* `subdomain`
* `tolerations`
* `topologySpreadConstraints`
* `volumes`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.resource.kind`

[spec](#spec) > [resource](#specresource) > kind

The kind of Kubernetes resource to find.

| Type     | Allowed Values                           | Required |
| -------- | ---------------------------------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | Yes      |

### `spec.resource.name`

[spec](#spec) > [resource](#specresource) > name

The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.resource.podSelector`

[spec](#spec) > [resource](#specresource) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.resource.containerName`

[spec](#spec) > [resource](#specresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec`

[spec](#spec) > podSpec

Supply a custom Pod specification. This should be a normal Kubernetes Pod manifest. Note that the spec will be modified for the Run, including overriding with other fields you may set here (such as `args` and `env`), and removing certain fields that are not supported.

You can find the full Pod spec in the [official Kubernetes documentation](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/#PodSpec)

The following Pod spec fields from the `podSpec` will be used (if present) when executing the Run:
* `affinity`
* `automountServiceAccountToken`
* `containers`
* `dnsConfig`
* `dnsPolicy`
* `enableServiceLinks`
* `hostAliases`
* `hostIPC`
* `hostNetwork`
* `hostPID`
* `hostname`
* `imagePullSecrets`
* `nodeName`
* `nodeSelector`
* `overhead`
* `preemptionPolicy`
* `priority`
* `priorityClassName`
* `runtimeClassName`
* `schedulerName`
* `securityContext`
* `serviceAccount`
* `serviceAccountName`
* `shareProcessNamespace`
* `subdomain`
* `tolerations`
* `topologySpreadConstraints`
* `volumes`

| Type     | Required |
| -------- | -------- |
| `object` | No       |


## Outputs

The following keys are available via the `${actions.run.<name>}` template string key for `kubernetes-pod`
action.

### `${actions.run.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.run.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.run.my-run.disabled}
```

### `${actions.run.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.buildPath}
```

### `${actions.run.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.sourcePath}
```

### `${actions.run.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.run.my-run.mode}
```

### `${actions.run.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.run.<name>.outputs.log}`

The full log output from the executed action. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |

