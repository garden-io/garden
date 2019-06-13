# `kubernetes` reference

Specify one or more Kubernetes manifests to deploy.

You can either (or both) specify the manifests as part of the `garden.yml` configuration, or you can refer to
one or more files with existing manifests.

Note that if you include the manifests in the `garden.yml` file, you can use
[template strings](https://docs.garden.io/reference/template-strings) to interpolate values into the manifests.

If you need more advanced templating features you can use the
[helm](https://docs.garden.io/reference/module-types/helm) module type.

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-files.md).
The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available
schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys


### `apiVersion`

The schema version of this module's config (currently not used).

| Type | Required | Allowed Values |
| ---- | -------- | -------------- |
| `string` | Yes | "garden.io/v0"

### `kind`

| Type | Required | Allowed Values |
| ---- | -------- | -------------- |
| `string` | Yes | "Module"

### `type`

The type of this module.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:

```yaml
type: "container"
```

### `name`

The name of this module.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:

```yaml
name: "my-sweet-module"
```

### `description`

| Type | Required |
| ---- | -------- |
| `string` | No

### `include`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
as well as when responding to filesystem watch events.

Note that you can also _exclude_ files by placing `.gardenignore` files in your source tree, which use the
same format as `.gitignore` files.

Also note that specifying an empty list here means _no sources_ should be included.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:

```yaml
include:
  - Dockerfile
  - my-app.js
```

### `repositoryUrl`

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's
config from the local garden.yml file.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `allowPublish`

When false, disables pushing this module to remote registries.

| Type | Required |
| ---- | -------- |
| `boolean` | No

### `build`

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type | Required |
| ---- | -------- |
| `object` | No

### `build.dependencies[]`

[build](#build) > dependencies

A list of modules that must be built before this module is built.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

Example:

```yaml
build:
  ...
  dependencies:
    - name: some-other-module-name
```

### `build.dependencies[].name`

[build](#build) > [dependencies](#build.dependencies[]) > name

Module name to build ahead of this module.

| Type | Required |
| ---- | -------- |
| `string` | Yes

### `build.dependencies[].copy[]`

[build](#build) > [dependencies](#build.dependencies[]) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

### `build.dependencies[].copy[].source`

[build](#build) > [dependencies](#build.dependencies[]) > [copy](#build.dependencies[].copy[]) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type | Required |
| ---- | -------- |
| `string` | Yes

### `build.dependencies[].copy[].target`

[build](#build) > [dependencies](#build.dependencies[]) > [copy](#build.dependencies[].copy[]) > target

POSIX-style path or filename to copy the directory or file(s) to (defaults to same as source path).

| Type | Required |
| ---- | -------- |
| `string` | No

### `dependencies`

List of names of services that should be deployed before this chart.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

### `manifests`

List of Kubernetes resource manifests to deploy. Use this instead of the `files` field if you need to resolve template strings in any of the manifests.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

### `manifests[].apiVersion`

[manifests](#manifests) > apiVersion

The API version of the resource.

| Type | Required |
| ---- | -------- |
| `string` | Yes

### `manifests[].kind`

[manifests](#manifests) > kind

The kind of the resource.

| Type | Required |
| ---- | -------- |
| `string` | Yes

### `manifests[].metadata`

[manifests](#manifests) > metadata

| Type | Required |
| ---- | -------- |
| `object` | Yes

### `manifests[].metadata.name`

[manifests](#manifests) > [metadata](#manifests[].metadata) > name

The name of the resource.

| Type | Required |
| ---- | -------- |
| `string` | Yes

### `files`

POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests.

| Type | Required |
| ---- | -------- |
| `array[string]` | No


## Complete YAML schema
```yaml
apiVersion: garden.io/v0
kind: Module
type:
name:
description:
include:
repositoryUrl:
allowPublish: true
build:
  dependencies:
    - name:
      copy:
        - source:
          target: ''
dependencies: []
manifests:
  - apiVersion:
    kind:
    metadata:
      name:
files: []
```