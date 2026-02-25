---
order: 9
title: Custom Command template context
---

# Custom Command template context

The below keys are available in template strings for the `exec` and `gardenCommand` fields in [Custom Commands](../../features/custom-commands.md).

### `${local.*}`

Context variables that are specific to the currently running environment/machine.

| Type     |
| -------- |
| `object` |

### `${local.artifactsPath}`

The absolute path to the directory where exported artifacts from test and task runs are stored.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${local.artifactsPath}
```

### `${local.env.*}`

A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env).

| Type     |
| -------- |
| `object` |

### `${local.env.<env-var-name>}`

The environment variable value.

| Type     |
| -------- |
| `string` |

### `${local.arch}`

A string indicating the architecture that the framework is running on (see https://nodejs.org/api/process.html#process_process_arch)

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${local.arch}
```

### `${local.platform}`

A string indicating the platform that the framework is running on (see https://nodejs.org/api/process.html#process_process_platform)

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${local.platform}
```

### `${local.projectPath}`

The absolute path to the project root directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${local.projectPath}
```

### `${local.username}`

The current username (as resolved by https://github.com/sindresorhus/username).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${local.username}
```

### `${local.usernameLowerCase}`

The current username (as resolved by https://github.com/sindresorhus/username), with any upper case characters converted to lower case.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${local.usernameLowerCase}
```

### `${command.*}`

Information about the currently running command and its arguments.

| Type     |
| -------- |
| `object` |

### `${command.name}`

The currently running Garden CLI command, without positional arguments or option flags. This can be handy to e.g. change some variables based on whether you're running `garden test` or some other specific command.

Note that this will currently always resolve to `"workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

Option values can be referenced by the option's default name (e.g. `sync-mode`) or its alias (e.g. `sync`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

### `${datetime.*}`

Information about the date/time at template resolution time.

| Type     |
| -------- |
| `object` |

### `${datetime.now}`

The current UTC date and time, at time of template resolution, in ISO-8601 format.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${datetime.now}
```

### `${datetime.today}`

The current UTC date, at time of template resolution, in ISO-8601 format.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${datetime.today}
```

### `${datetime.timestamp}`

The current UTC Unix timestamp (in seconds), at time of template resolution.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${datetime.timestamp}
```

### `${project.*}`

Information about the Garden project.

| Type     |
| -------- |
| `object` |

### `${project.name}`

The name of the Garden project.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${project.name}
```

### `${git.*}`

Information about the current state of the project's Git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is resolved at the start of the Garden command's execution, and is not updated if the current branch changes during the command's execution (which could happen, for example, when using watch-mode commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${git.commitHash}`

The current Git commit hash, if available. Resolves to an empty string if the repository has no commits.

When using remote sources, the hash used is that of the project/top-level repository (the one that contains the project configuration).

The hash is resolved at the start of the Garden command's execution, and is not updated if the current commit changes during the command's execution (which could happen, for example, when using watch-mode commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.commitHash}
```

### `${git.originUrl}`

The remote origin URL of the project Git repository.

When using remote sources, the URL is that of the project/top-level repository (the one that contains the project configuration).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.originUrl}
```

### `${variables.*}`

A map of all variables defined in the command configuration.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${args.*}`

Map of all arguments, as defined in the Command spec. Also includes `$all`, `$rest` and `--` fields. See their description for details.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${args.$all[]}`

Every argument passed to the command, except the name of the command itself.

| Type            | Default |
| --------------- | ------- |
| `array[string]` | `[]`    |

### `${args.$rest[]}`

Every positional argument and option that isn't explicitly defined in the custom command, including any global Garden flags.

| Type            | Default |
| --------------- | ------- |
| `array[string]` | `[]`    |

### `${args.--[]}`

Every argument following -- on the command line.

| Type            | Default |
| --------------- | ------- |
| `array[string]` | `[]`    |

### `${args.<name>}`

Number, string or boolean

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${opts.*}`

Map of all options, as defined in the Command spec.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${opts.<name>}`

Number, string or boolean

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${environment.*}`

Information about the environment that Garden is running against. Only available when the command references environment-specific data.

| Type     |
| -------- |
| `object` |

### `${environment.name}`

The name of the environment Garden is running against, excluding the namespace.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${environment.name}
```

### `${environment.fullName}`

The full name of the environment Garden is running against, including the namespace.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${environment.fullName}
```

### `${environment.namespace}`

The currently active namespace (if any).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${environment.namespace}
```

### `${secrets.*}`

A map of all secrets for this project in the current environment.

| Type     |
| -------- |
| `object` |

### `${secrets.<secret-name>}`

| Type     |
| -------- |
| `string` |

### `${providers.*}`

Retrieve information about providers that are defined in the project.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${providers.<provider-name>.config.*}`

The resolved configuration for the provider.

| Type     |
| -------- |
| `object` |

### `${providers.<provider-name>.config.<config-key>}`

The provider config key value. Refer to individual [provider references](https://docs.garden.io/cedar-0.14/reference/providers) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${providers.<provider-name>.outputs.*}`

The outputs defined by the provider (see individual plugin docs for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${providers.<provider-name>.outputs.<output-key>}`

The provider output value. Refer to individual [provider references](https://docs.garden.io/cedar-0.14/reference/providers) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.*}`

Runtime outputs and information from other actions (only resolved at runtime when executing actions).

| Type     |
| -------- |
| `object` |

### `${actions.build.*}`

Information about a Build action dependency, including its outputs.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.build.<action-name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.build.<action-name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.build.<action-name>.disabled}
```

### `${actions.build.<action-name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.<action-name>.buildPath}
```

### `${actions.build.<action-name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.<action-name>.sourcePath}
```

### `${actions.build.<action-name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.build.<action-name>.mode}
```

### `${actions.build.<action-name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.build.<action-name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.build.<action-name>.outputs.*}`

The outputs defined by the action (see individual action/module type [references](https://docs.garden.io/cedar-0.14/reference) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.build.<action-name>.outputs.<output-name>}`

The action output value. Refer to individual [action/module type references](https://docs.garden.io/cedar-0.14/reference) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.build.<action-name>.version}`

The current version of the action.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.<action-name>.version}
```

### `${actions.deploy.*}`

Information about a Deploy action dependency, including its outputs.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<action-name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.deploy.<action-name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.deploy.<action-name>.disabled}
```

### `${actions.deploy.<action-name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.<action-name>.buildPath}
```

### `${actions.deploy.<action-name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.<action-name>.sourcePath}
```

### `${actions.deploy.<action-name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.deploy.<action-name>.mode}
```

### `${actions.deploy.<action-name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<action-name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.deploy.<action-name>.outputs.*}`

The outputs defined by the action (see individual action/module type [references](https://docs.garden.io/cedar-0.14/reference) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<action-name>.outputs.<output-name>}`

The action output value. Refer to individual [action/module type references](https://docs.garden.io/cedar-0.14/reference) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.deploy.<action-name>.version}`

The current version of the action.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.<action-name>.version}
```

### `${actions.run.*}`

Information about a Run action dependency, including its outputs.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<action-name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.run.<action-name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.run.<action-name>.disabled}
```

### `${actions.run.<action-name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.<action-name>.buildPath}
```

### `${actions.run.<action-name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.<action-name>.sourcePath}
```

### `${actions.run.<action-name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.run.<action-name>.mode}
```

### `${actions.run.<action-name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<action-name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.run.<action-name>.outputs.*}`

The outputs defined by the action (see individual action/module type [references](https://docs.garden.io/cedar-0.14/reference) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<action-name>.outputs.<output-name>}`

The action output value. Refer to individual [action/module type references](https://docs.garden.io/cedar-0.14/reference) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.run.<action-name>.version}`

The current version of the action.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.<action-name>.version}
```

### `${actions.test.*}`

Information about a Test action dependency, including its outputs.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.test.<action-name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.test.<action-name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.test.<action-name>.disabled}
```

### `${actions.test.<action-name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.test.<action-name>.buildPath}
```

### `${actions.test.<action-name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.test.<action-name>.sourcePath}
```

### `${actions.test.<action-name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.test.<action-name>.mode}
```

### `${actions.test.<action-name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.test.<action-name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.test.<action-name>.outputs.*}`

The outputs defined by the action (see individual action/module type [references](https://docs.garden.io/cedar-0.14/reference) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.test.<action-name>.outputs.<output-name>}`

The action output value. Refer to individual [action/module type references](https://docs.garden.io/cedar-0.14/reference) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.test.<action-name>.version}`

The current version of the action.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.test.<action-name>.version}
```

### `${actions.services.*}`

Alias for `deploy`.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.services.<action-name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.services.<action-name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.services.<action-name>.disabled}
```

### `${actions.services.<action-name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.services.<action-name>.buildPath}
```

### `${actions.services.<action-name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.services.<action-name>.sourcePath}
```

### `${actions.services.<action-name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.services.<action-name>.mode}
```

### `${actions.services.<action-name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.services.<action-name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.services.<action-name>.outputs.*}`

The outputs defined by the action (see individual action/module type [references](https://docs.garden.io/cedar-0.14/reference) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.services.<action-name>.outputs.<output-name>}`

The action output value. Refer to individual [action/module type references](https://docs.garden.io/cedar-0.14/reference) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.services.<action-name>.version}`

The current version of the action.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.services.<action-name>.version}
```

### `${actions.tasks.*}`

Alias for `run`.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.tasks.<action-name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.tasks.<action-name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.tasks.<action-name>.disabled}
```

### `${actions.tasks.<action-name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.tasks.<action-name>.buildPath}
```

### `${actions.tasks.<action-name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.tasks.<action-name>.sourcePath}
```

### `${actions.tasks.<action-name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.tasks.<action-name>.mode}
```

### `${actions.tasks.<action-name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.tasks.<action-name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.tasks.<action-name>.outputs.*}`

The outputs defined by the action (see individual action/module type [references](https://docs.garden.io/cedar-0.14/reference) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.tasks.<action-name>.outputs.<output-name>}`

The action output value. Refer to individual [action/module type references](https://docs.garden.io/cedar-0.14/reference) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${actions.tasks.<action-name>.version}`

The current version of the action.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.tasks.<action-name>.version}
```

### `${modules.*}`

Retrieve information about modules that are defined in the project.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${modules.<module-name>.buildPath}`

The build path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.<module-name>.buildPath}
```

### `${modules.<module-name>.name}`

The name of the module.

| Type     |
| -------- |
| `string` |

### `${modules.<module-name>.path}`

The source path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.<module-name>.path}
```

### `${modules.<module-name>.outputs.*}`

The outputs defined by the module (see individual module type [references](https://docs.garden.io/cedar-0.14/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${modules.<module-name>.outputs.<output-name>}`

The module output value. Refer to individual [module type references](https://docs.garden.io/cedar-0.14/reference/module-types) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${modules.<module-name>.var.*}`

A map of all variables defined in the module.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${modules.<module-name>.var.<variable-name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${modules.<module-name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.<module-name>.version}
```

### `${runtime.*}`

Runtime outputs and information from services and tasks (only resolved at runtime when deploying services and running tasks).

| Type     |
| -------- |
| `object` |

### `${runtime.services.*}`

Runtime information from the services that the service/task being run depends on.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.services.<service-name>.outputs.*}`

The runtime outputs defined by the service (see individual module type [references](https://docs.garden.io/cedar-0.14/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.services.<service-name>.outputs.<output-name>}`

The service output value. Refer to individual [module type references](https://docs.garden.io/cedar-0.14/reference/module-types) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${runtime.services.<service-name>.version}`

The current version of the service.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${runtime.services.<service-name>.version}
```

### `${runtime.tasks.*}`

Runtime information from the tasks that the service/task being run depends on.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.tasks.<task-name>.outputs.*}`

The runtime outputs defined by the task (see individual module type [references](https://docs.garden.io/cedar-0.14/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.tasks.<task-name>.outputs.<output-name>}`

The task output value. Refer to individual [module type references](https://docs.garden.io/cedar-0.14/reference/module-types) for details.

| Type                          |
| ----------------------------- |
| `string \| number \| boolean` |

### `${runtime.tasks.<task-name>.version}`

The current version of the task.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${runtime.tasks.<task-name>.version}
```

