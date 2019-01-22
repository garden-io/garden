## `openfaas` reference

Below is the schema reference for the `openfaas` module type. For an introduction to configuring Garden modules, please look at our [Configuration guide](../../using-garden/configuration-files.md).

## Configuration keys

### `env`

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `tasks`

A list of tasks that can be run in this module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `tasks.name`
[tasks](#tasks) > name

The name of the task.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `tasks.description`
[tasks](#tasks) > description

A description of the task.

| Type | Required |
| ---- | -------- |
| `string` | No
### `tasks.dependencies`
[tasks](#tasks) > dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `tasks.timeout`
[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type | Required |
| ---- | -------- |
| `number` | No
### `tasks.command`
[tasks](#tasks) > command

The command to run in the module build context.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `tests`

A list of tests to run in the module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `tests.name`
[tests](#tests) > name

The name of the test.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `tests.dependencies`
[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `tests.timeout`
[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type | Required |
| ---- | -------- |
| `number` | No
### `tests.command`
[tests](#tests) > command

The command to run in the module build context in order to test it.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `tests.env`
[tests](#tests) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `dependencies`

The names of services/functions that this function depends on at runtime.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `handler`

Specify which directory under the module contains the handler file/function.

| Type | Required |
| ---- | -------- |
| `string` | No
### `image`

The image name to use for the built OpenFaaS container (defaults to the module name)

| Type | Required |
| ---- | -------- |
| `string` | No
### `lang`

The OpenFaaS language template to use to build this function.

| Type | Required |
| ---- | -------- |
| `string` | Yes

## Complete schema
```yaml
env:
  {}

tasks:
  - name:
    description:
    dependencies:
      []
    timeout: null
    command:

tests:
  - name:
    dependencies:
      []
    timeout: null
    command:
    env:
      {}

dependencies:
  []

handler: .

image:

lang:
```