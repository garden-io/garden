---
order: 50
title: Template Strings
---

# Template string reference

Below you'll find the schema of the keys available when interpolating template strings (see our [Variables and Templating](../using-garden/variables-and-templating.md) guide for more information and usage examples), as well as the list of available helper functions you can use in template strings.

Note that there are multiple sections below, since different configuration sections have different keys available to them. Please make sure to refer to the correct section.

## Helper functions

### base64Decode

Decodes the given base64-encoded string.

Usage: `base64Decode(string)`

Examples:
* `${base64Decode("bXkgdmFsdWU=")}` -> `"my value"`

### base64Encode

Encodes the given string as base64.

Usage: `base64Encode(string)`

Examples:
* `${base64Encode("my value")}` -> `"bXkgdmFsdWU="`

### camelCase

Converts the given string to a valid camelCase identifier, changing the casing and removing characters as necessary.

Usage: `camelCase(string)`

Examples:
* `${camelCase("Foo Bar")}` -> `"fooBar"`
* `${camelCase("--foo-bar--")}` -> `"fooBar"`
* `${camelCase("__FOO_BAR__")}` -> `"fooBar"`

### isEmpty

Returns true if the given value is an empty string, object, array, null or undefined.

Usage: `isEmpty([value])`

Examples:
* `${isEmpty({})}` -> `true`
* `${isEmpty({"not":"empty"})}` -> `false`
* `${isEmpty([])}` -> `true`
* `${isEmpty([1,2,3])}` -> `false`
* `${isEmpty("")}` -> `true`
* `${isEmpty("not empty")}` -> `false`
* `${isEmpty(null)}` -> `true`

### jsonDecode

Decodes the given JSON-encoded string.

Usage: `jsonDecode(string)`

Examples:
* `${jsonDecode("{\"foo\": \"bar\"}")}` -> `{"foo":"bar"}`
* `${jsonDecode("\"JSON encoded string\"")}` -> `"JSON encoded string"`
* `${jsonDecode("[\"my\", \"json\", \"array\"]")}` -> `["my","json","array"]`

### jsonEncode

Encodes the given value as JSON.

Usage: `jsonEncode(value)`

Examples:
* `${jsonEncode(["some","array"])}` -> `"[\"some\",\"array\"]"`
* `${jsonEncode({"some":"object"})}` -> `"{\"some\":\"object\"}"`

### kebabCase

Converts the given string to a valid kebab-case identifier, changing to all lowercase and removing characters as necessary.

Usage: `kebabCase(string)`

Examples:
* `${kebabCase("Foo Bar")}` -> `"foo-bar"`
* `${kebabCase("fooBar")}` -> `"foo-bar"`
* `${kebabCase("__FOO_BAR__")}` -> `"foo-bar"`

### lower

Convert the given string to all lowercase.

Usage: `lower(string)`

Examples:
* `${lower("Some String")}` -> `"some string"`

### replace

Replaces all occurrences of a given substring in a string.

Usage: `replace(string, substring, replacement)`

Examples:
* `${replace("string_with_underscores", "_", "-")}` -> `"string-with-underscores"`
* `${replace("remove.these.dots", ".", "")}` -> `"removethesedots"`

### slice

Slices a string or array at the specified start/end offsets. Note that you can use a negative number for the end offset to count backwards from the end.

Usage: `slice(input, start, [end])`

Examples:
* `${slice("ThisIsALongStringThatINeedAPartOf", 11, -7)}` -> `"StringThatINeed"`
* `${slice(".foo", 1)}` -> `"foo"`

### split

Splits the given string by a substring (e.g. a comma, colon etc.).

Usage: `split(string, separator)`

Examples:
* `${split("a,b,c", ",")}` -> `["a","b","c"]`
* `${split("1:2:3:4", ":")}` -> `["1","2","3","4"]`

### trim

Trims whitespace (or other specified characters) off the ends of the given string.

Usage: `trim(string, [characters])`

Examples:
* `${trim("   some string with surrounding whitespace ")}` -> `"some string with surrounding whitespace"`

### upper

Converts the given string to all uppercase.

Usage: `upper(string)`

Examples:
* `${upper("Some String")}` -> `"SOME STRING"`

### uuidv4

Generates a random v4 UUID.

Usage: `uuidv4()`

Examples:
* `${uuidv4()}` -> `1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`

### yamlDecode

Decodes the given YAML-encoded string. Note that for multi-document YAML strings, you need to set the 2nd argument to true (see below).

Usage: `yamlDecode(string, [multiDocument])`

Examples:
* `${yamlDecode("a: 1\nb: 2\n")}` -> `{"a":1,"b":2}`
* `${yamlDecode("a: 1\nb: 2\n---\na: 3\nb: 4\n", true)}` -> `[{"a":1,"b":2},{"a":3,"b":4}]`

### yamlEncode

Encodes the given value as YAML.

Usage: `yamlEncode(value, [multiDocument])`

Examples:
* `${yamlEncode({"my":"simple document"})}` -> `"my: simple document\n"`
* `${yamlEncode([{"a":1,"b":2},{"a":3,"b":4}], true)}` -> `"---a: 1\nb: 2\n---a: 3\nb: 4\n"`

## Project configuration context

The following keys are available in any template strings within project definitions in `garden.yml` config files, except the `name` field (which cannot be templated). See the [Environment](#environment-configuration-context) and [Provider](#provider-configuration-context) sections below for additional keys available when configuring `environments` and `providers`, respectively.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |


## Remote source configuration context

The following keys are available in template strings under the `sources` key in project configs.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |

### `${variables.*}`

A map of all variables defined in the project configuration, including environment-specific variables.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${environment.*}`

Information about the environment that Garden is running against.

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


## Environment configuration context

The following keys are available in template strings under the `environments` key in project configs. Additional keys are available for the `environments[].providers` field, see the [Provider](#provider-configuration-context) section below for those.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |

### `${variables.*}`

A map of all variables defined in the project configuration.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                        |
| --------------------------- |
| `string | number | boolean` |


## Provider configuration context

The following keys are available in template strings under the `providers` key (or `environments[].providers`) in project configs.

Providers can also reference outputs defined by other providers, via the `${providers.<provider-name>.outputs}` key. For details on which outputs are available for a given provider, please refer to the [reference](https://docs.garden.io/reference/providers) docs for the provider in question, and look for the _Outputs_ section.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |

### `${variables.*}`

A map of all variables defined in the project configuration, including environment-specific variables.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${environment.*}`

Information about the environment that Garden is running against.

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

The provider config key value. Refer to individual [provider references](https://docs.garden.io/reference/providers) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${providers.<provider-name>.outputs.*}`

The outputs defined by the provider (see individual plugin docs for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${providers.<provider-name>.outputs.<output-key>}`

The provider output value. Refer to individual [provider references](https://docs.garden.io/reference/providers) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |


## Module configuration context

The below keys are available in template strings in module configs. These include all the keys from the sections above.

Modules can reference outputs defined by providers, via the `${providers.<provider-name>.outputs}` key. For details on which outputs are available for a given provider, please refer to the [reference](https://docs.garden.io/reference/providers) docs for the provider in question, and look for the _Outputs_ section.

Modules can also reference outputs defined by other modules, via the `${modules.<module-name>.outputs}` key, as well as service and task outputs via the `${runtime.services.<service-name>.outputs}` and `${runtime.tasks.<task-name>.outputs}` keys.
For details on which outputs are available for a given module type, please refer to the [reference](https://docs.garden.io/reference/module-types) docs for the module type in question, and look for the _Outputs_ section.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |

### `${variables.*}`

A map of all variables defined in the project configuration, including environment-specific variables.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${environment.*}`

Information about the environment that Garden is running against.

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

The provider config key value. Refer to individual [provider references](https://docs.garden.io/reference/providers) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${providers.<provider-name>.outputs.*}`

The outputs defined by the provider (see individual plugin docs for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${providers.<provider-name>.outputs.<output-key>}`

The provider output value. Refer to individual [provider references](https://docs.garden.io/reference/providers) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

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

The local path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.<module-name>.path}
```

### `${modules.<module-name>.outputs.*}`

The outputs defined by the module (see individual module type [references](https://docs.garden.io/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${modules.<module-name>.outputs.<output-name>}`

The module output value. Refer to individual [module type references](https://docs.garden.io/reference/module-types) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

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

The runtime outputs defined by the service (see individual module type [references](https://docs.garden.io/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.services.<service-name>.outputs.<output-name>}`

The service output value. Refer to individual [module type references](https://docs.garden.io/reference/module-types) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

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

The runtime outputs defined by the task (see individual module type [references](https://docs.garden.io/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.tasks.<task-name>.outputs.<output-name>}`

The task output value. Refer to individual [module type references](https://docs.garden.io/reference/module-types) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${runtime.tasks.<task-name>.version}`

The current version of the task.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${runtime.tasks.<task-name>.version}
```

### `${inputs.*}`

The inputs provided to the module through a undefined, if applicable.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${inputs.<input-key>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${parent.*}`

Information about the parent module (if the module is a submodule, e.g. generated in a templated module).

| Type     |
| -------- |
| `object` |

### `${parent.name}`

The name of the parent module.

| Type     |
| -------- |
| `string` |

### `${template.*}`

Information about the undefined used when generating the module.

| Type     |
| -------- |
| `object` |

### `${template.name}`

The name of the undefined being resolved.

| Type     |
| -------- |
| `string` |

### `${this.*}`

Information about the module currently being resolved.

| Type     |
| -------- |
| `object` |

### `${this.buildPath}`

The build path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${this.buildPath}
```

### `${this.name}`

The name of the module.

| Type     |
| -------- |
| `string` |

### `${this.path}`

The local path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${this.path}
```


## Output configuration context

The below keys are available in template strings for _project outputs_, specified in `outputs[].value` keys in project config files. These include all the keys from the sections above.

Output values can reference outputs defined by providers, via the `${providers.<provider-name>.outputs}` key. For details on which outputs are available for a given provider, please refer to the [reference](https://docs.garden.io/reference/providers) docs for the provider in question, and look for the _Outputs_ section.

Output values may also reference outputs defined by modules, via the `${modules.<module-name>.outputs}` key, as well as service and task outputs via the `${runtime.services.<service-name>.outputs}` and `${runtime.tasks.<task-name>.outputs}` keys.
For details on which outputs are available for a given module type, please refer to the [reference](https://docs.garden.io/reference/module-types) docs for the module type in question, and look for the _Outputs_ section.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |

### `${variables.*}`

A map of all variables defined in the project configuration, including environment-specific variables.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${environment.*}`

Information about the environment that Garden is running against.

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

The provider config key value. Refer to individual [provider references](https://docs.garden.io/reference/providers) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${providers.<provider-name>.outputs.*}`

The outputs defined by the provider (see individual plugin docs for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${providers.<provider-name>.outputs.<output-key>}`

The provider output value. Refer to individual [provider references](https://docs.garden.io/reference/providers) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

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

The local path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.<module-name>.path}
```

### `${modules.<module-name>.outputs.*}`

The outputs defined by the module (see individual module type [references](https://docs.garden.io/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${modules.<module-name>.outputs.<output-name>}`

The module output value. Refer to individual [module type references](https://docs.garden.io/reference/module-types) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

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

The runtime outputs defined by the service (see individual module type [references](https://docs.garden.io/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.services.<service-name>.outputs.<output-name>}`

The service output value. Refer to individual [module type references](https://docs.garden.io/reference/module-types) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

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

The runtime outputs defined by the task (see individual module type [references](https://docs.garden.io/reference/module-types) for details).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${runtime.tasks.<task-name>.outputs.<output-name>}`

The task output value. Refer to individual [module type references](https://docs.garden.io/reference/module-types) for details.

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${runtime.tasks.<task-name>.version}`

The current version of the task.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${runtime.tasks.<task-name>.version}
```


## Workflow configuration context

The below keys are available in template strings for Workflow configurations.

Note that the `{steps.*}` key is only available for the `steps[].command` and `steps[].script` fields in Workflow configs, and may only reference previous steps in the same workflow. See below for more details.

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

Note that this will currently always resolve to `"run workflow"` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${command.name}
```

### `${command.params.*}`

A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

For example, to see if a service is in hot-reload mode, you might do something like `${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

Option values can be referenced by the option's default name (e.g. `dev-mode`) or its alias (e.g. `dev`) if one is defined for that option.

| Type     |
| -------- |
| `object` |

### `${command.params.<name>}`

| Type  |
| ----- |
| `any` |

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

Information about the current state of the project's local git repository.

| Type     |
| -------- |
| `object` |

### `${git.branch}`

The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
(e.g. when rebasing), or if the repository has no commits.

When using remote sources, the branch used is that of the project/top-level repository (the one that contains
the project configuration).

The branch is computed at the start of the Garden command's execution, and is not updated if the current
branch changes during the command's execution (which could happen, for example, when using watch-mode
commands).

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${git.branch}
```

### `${secrets.<secret-name>}`

The secret's value.

| Type     |
| -------- |
| `string` |

### `${variables.*}`

A map of all variables defined in the project configuration, including environment-specific variables.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${variables.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${var.*}`

Alias for the variables field.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${var.<name>}`

Number, string or boolean

| Type                        |
| --------------------------- |
| `string | number | boolean` |

### `${environment.*}`

Information about the environment that Garden is running against.

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

### `${steps.*}`

Reference previous steps in a workflow. Only available in the `steps[].command` and `steps[].script` fields.
The name of the step should be the explicitly set `name` of the other step, or if one is not set, use
`step-<n>`, where <n> is the sequential number of the step (starting from 1).

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${steps.<step-name>.log}`

The full output log from the step.

| Type     |
| -------- |
| `string` |

### `${steps.<step-name>.outputs.*}`

The outputs returned by the step, as a mapping. Script steps will always have `stdout` and `stderr` keys.
Command steps return different keys, including potentially nested maps and arrays. Please refer to each command
for its output schema.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${steps.<step-name>.outputs.<output-key>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

