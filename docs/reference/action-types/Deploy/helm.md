---
title: "`helm` Deploy"
tocTitle: "`helm` Deploy"
---

# `helm` Deploy

## Description

Specify a Helm chart (either in your repository or remote from a registry) to deploy.

Refer to the [Helm guide](../../../garden-for/kubernetes/install-helm-chart.md) for usage instructions.

Garden uses Helm 3.18.3.

Below is the full schema reference for the action.

`helm` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

You can use `source.repository` to get the source from an external repository. For more information on remote actions, please refer to the [Remote Sources guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).

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

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

Path to a file containing variables.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `varfiles[].optional`

[varfiles](#varfiles) > optional

Whether the varfile is optional.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `version`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `version.excludeFields[]`

[version](#version) > excludeFields

Specify a list of config fields that should be ignored when computing the version hash for this action. Each item should be an array of strings, specifying the path to the field to ignore, e.g. `[spec, env, HOSTNAME]` would ignore `spec.env.HOSTNAME` in the configuration when computing the version.

For example, you might have a field that naturally changes for every individual test or dev environment, such as a dynamic hostname. You could solve for that with something like this:

```yaml
version:
  excludeFields:
    - [spec, env, HOSTNAME]
```

Arrays can also be indexed with numeric indices, but you can also use wildcards to exclude specific fields on all objects in arrays. Example:

```yaml
kind: Test
type: container
...
spec:
  artifacts:
    - source: foo
      target: bar  # Gets excluded from the version calculation
version:
  excludeFields:
    - [spec, artifacts, "*", target]
```

Only simple `"*"` wildcards are supported for the moment (i.e. you can't exclude by `"something*"` or use question marks for individual character matching).

Note that it is very important not to specify overly broad exclusions here, as this may cause the version to change too rarely, which may cause build errors or tests to not run when they should.

| Type           | Required |
| -------------- | -------- |
| `array[array]` | No       |

### `version.excludeValues[]`

[version](#version) > excludeValues

Specify one or more string values that should be ignored when computing the version hash for this action. You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.

For example, you might have a variable that naturally changes for every individual test or dev environment, such as a dynamic hostname. You could solve for that with something like this:

```yaml
version:
  excludeValues:
    - ${var.hostname}
```

With the `hostname` variable being defined in the Project configuration.

For each value specified under this field, every occurrence of that string value (even as part of a longer string) will be replaced when calculating the action version. The action configuration (used when performing the action) is not affected.

For instances when the value to replace may be overly broad (e.g. "api") it is generally better to use the `excludeFields` option, since that can be applied more surgically.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `build`

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Deploy"       | Yes      |

### `timeout`

Timeout for the deploy to complete, in seconds.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.namespace`

[spec](#spec) > namespace

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.portForwards[]`

[spec](#spec) > portForwards

Manually specify port forwards that Garden should set up when deploying in dev or watch mode. If specified, these override the auto-detection of forwardable ports, so you'll need to specify the full list of port forwards to create.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `spec.portForwards[].name`

[spec](#spec) > [portForwards](#specportforwards) > name

An identifier to describe the port forward.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.portForwards[].resource`

[spec](#spec) > [portForwards](#specportforwards) > resource

The full resource kind and name to forward to, e.g. Service/my-service or Deployment/my-deployment. Note that Garden will not validate this ahead of attempting to start the port forward, so you need to make sure this is correctly set. The types of resources supported will match that of the `kubectl port-forward` CLI command.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.portForwards[].targetPort`

[spec](#spec) > [portForwards](#specportforwards) > targetPort

The port number on the remote resource to forward to.

| Type     | Required |
| -------- | -------- |
| `number` | Yes      |

### `spec.portForwards[].localPort`

[spec](#spec) > [portForwards](#specportforwards) > localPort

The _preferred_ local port to forward from. If none is set, a random port is chosen. If the specified port is not available, a warning is shown and a random port chosen instead.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec.releaseName`

[spec](#spec) > releaseName

Optionally override the release name used when installing (defaults to the Deploy name).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.timeout`

[spec](#spec) > timeout

Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `spec.values`

[spec](#spec) > values

Map of values to pass to Helm when rendering the templates. May include arrays and nested objects. When specified, these take precedence over the values in the `values.yaml` file (or the files specified in `valueFiles`).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `spec.valueFiles[]`

[spec](#spec) > valueFiles

Specify value files to use when rendering the Helm chart. These will take precedence over the `values.yaml` file
bundled in the Helm chart, and should be specified in ascending order of precedence. Meaning, the last file in
this list will have the highest precedence.

If you _also_ specify keys under the `values` field, those will effectively be added as another file at the end
of this list, so they will take precedence over other files listed here.

Note that the paths here should be relative to the _config_ root, and the files should be contained in
this action config's directory.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `spec.atomic`

[spec](#spec) > atomic

Whether to set the `--atomic` flag during installs and upgrades. Set to `true` if you'd like the changes applied
to be reverted on failure. Set to false if e.g. you want to see more information about failures and then manually
roll back, instead of having Helm do it automatically on failure.

Note that setting `atomic` to `true` implies `wait`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.waitForUnhealthyResources`

[spec](#spec) > waitForUnhealthyResources

Whether to wait for the Helm command to complete before throwing an error if one of the resources being installed/upgraded is unhealthy.

By default, Garden will monitor the resources being created by Helm and throw an error as soon as one of them is unhealthy. This allows Garden to fail fast if there's an issue with one of the resources. If no issue is detected, Garden waits for the Helm command to complete.

If however `waitForUnhealthyResources` is set to `true` and some resources are unhealthy, then Garden will wait for Helm itself to throw an error which typically happens when it times out in the case of unhealthy resources (e.g. due to `ImagePullBackOff` or `CrashLoopBackOff` errors).

Waiting for the timeout can take awhile so using the default value here is recommended unless you'd like to completely mimic Helm's behaviour and not rely on Garden's resource monitoring.

Note that setting `atomic` to `true` implies `waitForUnhealthyResources`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.chart`

[spec](#spec) > chart

Specify the Helm chart to use.

If the chart is defined in the same directory as the action, you can skip this, and the chart sources will be detected. If the chart is in the source tree but in a sub-directory, you should set `chart.path` to the directory path, relative to the action directory.

For remote charts, there are multiple options:
- **[Helm Chart repository](https://helm.sh/docs/topics/chart_repository/)**: specify `chart.name` and `chart.version\, and optionally `chart.repo` (if the chart is not in the default "stable" repo).
- **[OCI-Based Registry](https://helm.sh/docs/topics/registries/)**: specify `chart.url` with the `oci://` URL and optionally `chart.version`.
- **Absolute URL to a packaged chart**: specify `chart.url`.

One of `chart.name`, `chart.path` or `chart.url` must be specified.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.chart.name`

[spec](#spec) > [chart](#specchart) > name

A valid Helm chart name or URI (same as you'd input to `helm install`) Required if the action doesn't contain the Helm chart itself.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
spec:
  ...
  chart:
    ...
    name: "ingress-nginx"
```

### `spec.chart.path`

[spec](#spec) > [chart](#specchart) > path

The path, relative to the action path, to the chart sources (i.e. where the Chart.yaml file is, if any).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `spec.chart.repo`

[spec](#spec) > [chart](#specchart) > repo

The repository URL to fetch the chart from. Defaults to the "stable" helm repo (https://charts.helm.sh/stable).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.chart.url`

[spec](#spec) > [chart](#specchart) > url

URL to OCI repository, or a URL to a packaged Helm chart archive.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.chart.version`

[spec](#spec) > [chart](#specchart) > version

The chart version to deploy.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.defaultTarget`

[spec](#spec) > defaultTarget

Specify a default resource in the deployment to use for syncs and for the `garden exec` command.

Specify either `kind` and `name`, or a `podSelector`. The resource should be one of the resources deployed by this action (otherwise the target is not guaranteed to be deployed with adjustments required for syncing).

Set `containerName` to specify a container to connect to in the remote Pod. By default the first container in the Pod is used.

Note that if you specify `podSelector` here, it is not validated to be a selector matching one of the resources deployed by the action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.defaultTarget.kind`

[spec](#spec) > [defaultTarget](#specdefaulttarget) > kind

The kind of Kubernetes resource to find.

| Type     | Allowed Values                           | Required |
| -------- | ---------------------------------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | Yes      |

### `spec.defaultTarget.name`

[spec](#spec) > [defaultTarget](#specdefaulttarget) > name

The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.defaultTarget.podSelector`

[spec](#spec) > [defaultTarget](#specdefaulttarget) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.defaultTarget.containerName`

[spec](#spec) > [defaultTarget](#specdefaulttarget) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.sync`

[spec](#spec) > sync

Configure path syncs for the resources in this Deploy.

If you have multiple syncs for the Deploy, you can use the `defaults` field to set common configuration for every individual sync.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.defaults`

[spec](#spec) > [sync](#specsync) > defaults

Defaults to set across every sync for this Deploy. If you use the `exclude` field here, it will be merged with any excludes set in individual syncs. These are applied on top of any defaults set in the provider configuration.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.defaults.exclude[]`

[spec](#spec) > [sync](#specsync) > [defaults](#specsyncdefaults) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

Any exclusion patterns defined in individual sync specs will be applied in addition to these patterns.

`.git` directories and `.garden` directories are always ignored.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
spec:
  ...
  sync:
    ...
    defaults:
      ...
      exclude:
        - dist/**/*
        - '*.log'
```

### `spec.sync.defaults.fileMode`

[spec](#spec) > [sync](#specsync) > [defaults](#specsyncdefaults) > fileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0o644 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o644` | No       |

### `spec.sync.defaults.directoryMode`

[spec](#spec) > [sync](#specsync) > [defaults](#specsyncdefaults) > directoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0o755 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o755` | No       |

### `spec.sync.defaults.owner`

[spec](#spec) > [sync](#specsync) > [defaults](#specsyncdefaults) > owner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `spec.sync.defaults.group`

[spec](#spec) > [sync](#specsync) > [defaults](#specsyncdefaults) > group

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `spec.sync.paths[]`

[spec](#spec) > [sync](#specsync) > paths

A list of syncs to start once the Deploy is successfully started.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `spec.sync.paths[].target`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > target

The Kubernetes resource to sync to. If specified, this is used instead of `spec.defaultTarget`.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.paths[].target.kind`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > [target](#specsyncpathstarget) > kind

The kind of Kubernetes resource to find.

| Type     | Allowed Values                           | Required |
| -------- | ---------------------------------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | Yes      |

### `spec.sync.paths[].target.name`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > [target](#specsyncpathstarget) > name

The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.sync.paths[].target.podSelector`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > [target](#specsyncpathstarget) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.paths[].target.containerName`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > [target](#specsyncpathstarget) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.sync.paths[].sourcePath`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > sourcePath

Path to a local directory to be synchronized with the target.
This should generally be a templated path to another action's source path (e.g. `${actions.build.my-container-image.sourcePath}`), or a relative path.
If a path is hard-coded, we recommend sticking with relative paths here, and using forward slashes (`/`) as a delimiter, as Windows-style paths with back slashes (`\`) and absolute paths will work on some platforms, but they are not portable and will not work for users on other platforms.
Defaults to the Deploy action's config's directory if no value is provided.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"."`   | No       |

Example:

```yaml
spec:
  ...
  sync:
    ...
    paths:
      - sourcePath: "src"
```

### `spec.sync.paths[].containerPath`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > containerPath

POSIX-style absolute path to sync to inside the container. The root path (i.e. "/") is not allowed.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
spec:
  ...
  sync:
    ...
    paths:
      - containerPath: "/app/src"
```

### `spec.sync.paths[].exclude[]`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

`.git` directories and `.garden` directories are always ignored.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
spec:
  ...
  sync:
    ...
    paths:
      - exclude:
          - dist/**/*
          - '*.log'
```

### `spec.sync.paths[].mode`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > mode

The sync mode to use for the given paths. See the [Code Synchronization guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for details.

| Type     | Allowed Values                                                                                                                            | Default          | Required |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- |
| `string` | "one-way", "one-way-safe", "one-way-replica", "one-way-reverse", "one-way-replica-reverse", "two-way", "two-way-safe", "two-way-resolved" | `"one-way-safe"` | Yes      |

### `spec.sync.paths[].defaultFileMode`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultFileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0o644 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o644` | No       |

### `spec.sync.paths[].defaultDirectoryMode`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultDirectoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0o755 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o755` | No       |

### `spec.sync.paths[].defaultOwner`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultOwner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `spec.sync.paths[].defaultGroup`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultGroup

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `spec.sync.overrides[]`

[spec](#spec) > [sync](#specsync) > overrides

Overrides for the container command and/or arguments for when in sync mode.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `spec.sync.overrides[].target`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > target

The Kubernetes resources to override. If specified, this is used instead of `spec.defaultTarget`.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.overrides[].target.kind`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > [target](#specsyncoverridestarget) > kind

The kind of Kubernetes resource to find.

| Type     | Allowed Values                           | Required |
| -------- | ---------------------------------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | Yes      |

### `spec.sync.overrides[].target.name`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > [target](#specsyncoverridestarget) > name

The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.sync.overrides[].target.podSelector`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > [target](#specsyncoverridestarget) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.overrides[].target.containerName`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > [target](#specsyncoverridestarget) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.sync.overrides[].command[]`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > command

Override the command/entrypoint in the matched container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.sync.overrides[].args[]`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > args

Override the args in the matched container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.sync.overrides[].image`

[spec](#spec) > [sync](#specsync) > [overrides](#specsyncoverrides) > image

Override the image of the matched container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |


## Outputs

The following keys are available via the `${actions.deploy.<name>}` template string key for `helm`
action.

### `${actions.deploy.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.deploy.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.disabled}
```

### `${actions.deploy.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.buildPath}
```

### `${actions.deploy.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.sourcePath}
```

### `${actions.deploy.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.mode}
```

### `${actions.deploy.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

