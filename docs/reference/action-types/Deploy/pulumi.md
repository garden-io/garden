---
title: "`pulumi` Deploy"
tocTitle: "`pulumi` Deploy"
---

# `pulumi` Deploy

## Description

Deploys a Pulumi stack and either creates/updates it automatically (if `autoApply: true`) or warns when the stack resources are not up-to-date, or errors if it's missing entirely.

**Note: It is not recommended to set `autoApply` to `true` for production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually preview and update using the provided plugin commands. Run `garden plugins pulumi` for details. Note that not all Pulumi CLI commands are wrapped by the plugin, only the ones where it's important to apply any variables defined in the action. For others, simply run the Pulumi CLI as usual from the project root.

Stack outputs are made available as action outputs. These can then be referenced by other actions under `${actions.<action-kind>.<action-name>.outputs.<key>}`. You can template in those values as e.g. command arguments or environment variables for other services.

Below is the full schema reference for the action.

`pulumi` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

### `logLevel`

Set the log level for this action. If not set, the action inherits the log level set for the command being executed.

Setting this can be useful for actions that produce a lot of log output that is not relevant to the user, or when debugging a specific action.

The `silent` level effectively suppresses log output from this action, except for errors.

| Type     | Allowed Values                                                 | Required |
| -------- | -------------------------------------------------------------- | -------- |
| `string` | "error", "warn", "info", "verbose", "debug", "silly", "silent" | Yes      |

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

### `version`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `version.excludeDependencies[]`

[version](#version) > excludeDependencies

Specify a list of dependencies that should be ignored when computing the version hash for this action.

Generally, the versions of all dependencies (both implicit and explicitly specified) are used when computing the version hash for this action.
However, there are cases where you might want to exclude certain dependencies from the version hash.

For example, you might have a dependency that naturally changes for every individual test or dev environment, such as a setup script that runs before the test. You could solve for that with something like this:

```yaml
version:
  excludeDependencies:
    - run.setup
```

Where `run.setup` refers to a Run action named `setup`. You can also use the full action reference for each dependency to exclude, e.g. `{ kind: "Run", name: "setup" }`.

| Type                     | Required |
| ------------------------ | -------- |
| `array[actionReference]` | No       |

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

### `version.excludeFiles[]`

[version](#version) > excludeFiles

Specify one or more file paths that should be ignored when computing the version hash for this action.

Specify in the same format as the `include` field. You may use glob patterns here.

For example, you might have a file that naturally changes for every build, such as a compiled binary (that isn't deterministic down to the byte), that you need to have in the build but shouldn't affect the version. You could solve for that with something like this:

```yaml
include:
  - src/**/*
  - some/compiled/binary
version:
  excludeFiles:
    - some/compiled/binary
```

Note that when you use this, you do need to make sure that other files or config fields do affect the version appropriately. Otherwise you might run into issues where builds are not updated or tests are not run when they should be.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

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

### `spec.allowDestroy`

[spec](#spec) > allowDestroy

If set to true, Garden will destroy the stack when calling `garden cleanup namespace` or `garden cleanup deploy <deploy action name>`.
This is useful to prevent unintentional destroys in production or shared environments.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.autoApply`

[spec](#spec) > autoApply

If set to false, deployments will fail unless a `planPath` is provided for this deploy action. This is useful when deploying to
production or shared environments, or when the action deploys infrastructure that you don't want to unintentionally update/create.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.createStack`

[spec](#spec) > createStack

If set to true, Garden will automatically create the stack if it doesn't already exist.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.root`

[spec](#spec) > root

Specify the path to the Pulumi project root, relative to the deploy action's root.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

### `spec.useNewPulumiVarfileSchema`

[spec](#spec) > useNewPulumiVarfileSchema

If set to true, the deploy action will use the new Pulumi varfile schema, which does not nest all variables under
the 'config' key automatically like the old schema. This allow setting variables at the root level of the varfile
that don't belong to the 'config' key. Example:
```
config:
  myVar: value
secretsprovider: gcpkms://projects/xyz/locations/global/keyRings/pulumi/cryptoKeys/pulumi-secrets
```
For more information see [this guide on pulumi varfiles and variables](https://docs.garden.io/pulumi-plugin/about#pulumi-varfile-schema)

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.pulumiVariables`

[spec](#spec) > pulumiVariables

A map of config variables to use when applying the stack. These are merged with the contents of any `pulumiVarfiles` provided
for this deploy action. The deploy action's stack config will be overwritten with the resulting merged config.
Variables declared here override any conflicting config variables defined in this deploy action's `pulumiVarfiles`.

Note: `pulumiVariables` should not include action outputs from other pulumi deploy actions when `cacheStatus` is set to true, since
the outputs may change from the time the stack status of the dependency action is initially queried to when it's been deployed.

Instead, use pulumi stack references when using the `cacheStatus` config option.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `spec.pulumiVarfiles[]`

[spec](#spec) > pulumiVarfiles

Specify one or more paths (relative to the deploy action's root) to YAML files containing pulumi configuration.

Templated paths that resolve to `null`, `undefined` or an empty string are ignored.

Any Garden template strings in these varfiles will be resolved when the files are loaded.

Each file must consist of a single YAML document, which must be a map (dictionary). Keys may contain any
value type.

If one or more varfiles is not found, no error is thrown (that varfile path is simply ignored).

Note: The old varfile schema nests all variables under the 'config' key automatically. If you need to set variables
at the root level of the varfile that don't belong to the 'config' key, set `useNewPulumiVarfileSchema` to true.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `spec.orgName`

[spec](#spec) > orgName

The name of the pulumi organization to use. Overrides the `orgName` set on the pulumi provider (if any).
To use the default org, set to null.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.cacheStatus`

[spec](#spec) > cacheStatus

When set to true, the pulumi stack will be tagged with the Garden service version when deploying. The tag
will then be used for service status checks for this service. If the version doesn't change between deploys,
the subsequent deploy is skipped.

Note that this will not pick up changes to stack outputs referenced via stack references in your pulumi stack,
unless they're referenced via template strings in the deploy action configuration.

When using stack references to other pulumi deploy actions in your project, we recommend including them in this
deploy action's `stackReferences` config field (see the documentation for that field on this page).

`cacheStatus: true` is not supported for self-managed state backends.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.stackReferences[]`

[spec](#spec) > stackReferences

When setting `cacheStatus` to true for this deploy action, you should include all stack references used by this
deploy action's pulumi stack in this field.

This lets Garden know to redeploy the pulumi stack if the output values of one or more of these stack references
have changed since the last deployment.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
spec:
  ...
  stackReferences:
    - ${actions.deploy.some-pulumi-deploy-action.outputs.ip-address}
    - ${actions.deploy.some-other-pulumi-deploy-action.outputs.database-url}
```

### `spec.deployFromPreview`

[spec](#spec) > deployFromPreview

When set to true, will use pulumi plans generated by the `garden plugins pulumi preview` command when
deploying, and will fail if no plan exists locally for the deploy action.

When this option is used, the pulumi plugin bypasses the status check altogether and passes the plan directly
to `pulumi up` (via the `--plan` option, which is experimental as of March 2022). You should therefore
take care to only use this config option when you're sure you want to apply the changes in the plan.

This option is intended for two-phase pulumi deployments, where pulumi preview diffs are first reviewed (e.g.
during code review).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.stack`

[spec](#spec) > stack

The name of the pulumi stack to use. Defaults to the current environment name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.showSecretsInOutput`

[spec](#spec) > showSecretsInOutput

When set to true, stack outputs which are marked as secrets will be shown in the output.

By default, Pulumi will print secret stack outputs as the string '[secret]' instead of
the true content of the output.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |


## Outputs

The following keys are available via the `${actions.deploy.<name>}` template string key for `pulumi`
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

### `${actions.deploy.<name>.outputs.*}`

A map of all the outputs returned by the Pulumi stack.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<name>.outputs.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

