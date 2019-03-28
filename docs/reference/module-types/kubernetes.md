# `kubernetes` reference

Below is the schema reference for the `kubernetes` module type. For an introduction to configuring Garden modules, please look at our [Configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys

### `module`



| Type | Required |
| ---- | -------- |
| `object` | No
### `module.build`
[module](#module) > build

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type | Required |
| ---- | -------- |
| `object` | No
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
### `module.dependencies[]`
[module](#module) > dependencies

List of names of services that should be deployed before this chart.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.manifests[]`
[module](#module) > manifests

List of Kubernetes resource manifests to deploy. Use this instead of the `files` field if you need to resolve template strings in any of the manifests.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.manifests[].apiVersion`
[module](#module) > [manifests](#module.manifests[]) > apiVersion

The API version of the resource.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.manifests[].kind`
[module](#module) > [manifests](#module.manifests[]) > kind

The kind of the resource.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.manifests[].metadata`
[module](#module) > [manifests](#module.manifests[]) > metadata



| Type | Required |
| ---- | -------- |
| `object` | Yes
### `module.manifests[].metadata.name`
[module](#module) > [manifests](#module.manifests[]) > [metadata](#module.manifests[].metadata) > name

The name of the resource.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.files[]`
[module](#module) > files

POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests.

| Type | Required |
| ---- | -------- |
| `array[string]` | No


## Complete YAML schema
```yaml
module:
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
