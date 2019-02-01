# garden.yml reference

Below is the schema reference for the [Project](#project-configuration) and [Module](#module-configuration) `garden.yml` configuration files. For an introduction to configuring a Garden project,
please look at our [configuration guide](../using-garden/configuration-files.md).

The reference is divided into four sections. The [first section](#project-configuration-keys) lists and describes the available schema keys for the project level configuration, and the [second section](#project-yaml-schema) contains the project level YAML schema.

The [third section](#module-configuration-keys) lists and describes the available schema keys for the module level configuration, and the [fourth section](#module-yaml-schema) contains the module level YAML schema.

Note that individual providers, e.g. `kubernetes`, add their own project level configuration keys. The provider types are listed on the [Providers page](./providers/README.md).

Likewise, individual module types, e.g. `container`, add additional configuration keys at the module level. Module types are listed on the [Module Types page](./module-types/README.md).

Please refer to those for more details on provider and module configuration.

## Project configuration keys

### `project`

Configuration for a Garden project. This should be specified in the garden.yml file in your project root.

| Type | Required |
| ---- | -------- |
| `object` | Yes
### `project.name`
[project](#project) > name

The name of the project.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  name: "my-sweet-project"
```
### `project.defaultEnvironment`
[project](#project) > defaultEnvironment

The default environment to use when calling commands without the `--env` parameter.

| Type | Required |
| ---- | -------- |
| `string` | No
### `project.environmentDefaults`
[project](#project) > environmentDefaults

Default environment settings. These are inherited (but can be overridden) by each configured environment.

| Type | Required |
| ---- | -------- |
| `object` | No

Example:
```yaml
project:
  ...
  environmentDefaults:
    providers: []
    variables: {}
```
### `project.environmentDefaults.providers[]`
[project](#project) > [environmentDefaults](#project.environmentdefaults) > providers

A list of providers that should be used for this environment, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.environmentDefaults.providers[].name`
[project](#project) > [environmentDefaults](#project.environmentdefaults) > [providers](#project.environmentdefaults.providers[]) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environmentDefaults:
    providers: []
    variables: {}
    ...
    providers:
      - name: "local-kubernetes"
```
### `project.environmentDefaults.variables`
[project](#project) > [environmentDefaults](#project.environmentdefaults) > variables

A key/value map of variables that modules can reference when using this environment.

| Type | Required |
| ---- | -------- |
| `object` | No
### `project.environments[]`
[project](#project) > environments

A list of environments to configure for the project.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

Example:
```yaml
project:
  ...
  environments:
    - name: local
      providers:
        - name: local-kubernetes
      variables: {}
```
### `project.environments[].providers[]`
[project](#project) > [environments](#project.environments[]) > providers

A list of providers that should be used for this environment, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.environments[].providers[].name`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - name: local
      providers:
        - name: local-kubernetes
      variables: {}
    - providers:
        - name: "local-kubernetes"
```
### `project.environments[].variables`
[project](#project) > [environments](#project.environments[]) > variables

A key/value map of variables that modules can reference when using this environment.

| Type | Required |
| ---- | -------- |
| `object` | No
### `project.environments[].name`
[project](#project) > [environments](#project.environments[]) > name

Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63 characters.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `project.sources[]`
[project](#project) > sources

A list of remote sources to import into project.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.sources[].name`
[project](#project) > [sources](#project.sources[]) > name

The name of the source to import

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `project.sources[].repositoryUrl`
[project](#project) > [sources](#project.sources[]) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  sources:
    - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```


## Project YAML schema
```yaml
project:
  name:
  defaultEnvironment: ''
  environmentDefaults:
    providers:
      - name:
    variables: {}
  environments:
    - providers:
        - name:
      variables: {}
      name:
  sources:
    - name:
      repositoryUrl:
```

## Module configuration keys

### `module`

Configure a module whose sources are located in this directory.

| Type | Required |
| ---- | -------- |
| `object` | Yes
### `module.type`
[module](#module) > type

The type of this module.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
module:
  ...
  type: "container"
```
### `module.name`
[module](#module) > name

The name of this module.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
module:
  ...
  name: "my-sweet-module"
```
### `module.description`
[module](#module) > description



| Type | Required |
| ---- | -------- |
| `string` | No
### `module.repositoryUrl`
[module](#module) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's
config from the local garden.yml file.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
module:
  ...
  repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```
### `module.allowPublish`
[module](#module) > allowPublish

When false, disables pushing this module to remote registries.

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `module.build`
[module](#module) > build

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.build.command[]`
[module](#module) > [build](#module.build) > command

The command to run inside the module's directory to perform the build.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
module:
  ...
  build:
    ...
    command:
      - npm
      - run
      - build
```
### `module.build.dependencies[]`
[module](#module) > [build](#module.build) > dependencies

A list of modules that must be built before this module is built.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

Example:
```yaml
module:
  ...
  build:
    ...
    dependencies:
      - name: some-other-module-name
```
### `module.build.dependencies[].name`
[module](#module) > [build](#module.build) > [dependencies](#module.build.dependencies[]) > name

Module name to build ahead of this module.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.build.dependencies[].copy[]`
[module](#module) > [build](#module.build) > [dependencies](#module.build.dependencies[]) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.build.dependencies[].copy[].source`
[module](#module) > [build](#module.build) > [dependencies](#module.build.dependencies[]) > [copy](#module.build.dependencies[].copy[]) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.build.dependencies[].copy[].target`
[module](#module) > [build](#module.build) > [dependencies](#module.build.dependencies[]) > [copy](#module.build.dependencies[].copy[]) > target

POSIX-style path or filename to copy the directory or file(s) to (defaults to same as source path).

| Type | Required |
| ---- | -------- |
| `string` | No


## Module YAML schema
```yaml
module:
  type:
  name:
  description:
  repositoryUrl:
  allowPublish: true
  build:
    command:
      []
    dependencies:
      - name:
        copy:
          - source:
            target: ''
```

