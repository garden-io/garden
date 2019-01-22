## `container` reference

Below is the schema reference for the `container` module type. For an introduction to configuring Garden modules, please look at our [Configuration guide](../../using-garden/configuration-files.md).

## Configuration keys

### `buildArgs`

Specify build arguments to use when building the container image.

| Type | Required |
| ---- | -------- |
| `object` | No
### `image`

Specify the image name for the container. Should be a valid Docker image identifier. If specified and the module does not contain a Dockerfile, this image will be used to deploy services for this module. If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.

| Type | Required |
| ---- | -------- |
| `string` | No
### `hotReload`

Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled services when those files or directories are modified. Applies to this module's services, and to services with this module as their `sourceModule`.

| Type | Required |
| ---- | -------- |
| `object` | No
### `hotReload.sync`
[hotReload](#hotreload) > sync

Specify one or more source files or directories to automatically sync into the running container.

| Type | Required |
| ---- | -------- |
| `array[object]` | Yes
### `hotReload.sync.source`
[hotReload](#hotreload) > [sync](#hotreload.sync) > source

POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be a relative path if provided. Defaults to the module's top-level directory if no value is provided.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
hotReload:
  sync:
    - source: "src"
```
### `hotReload.sync.target`
[hotReload](#hotreload) > [sync](#hotreload.sync) > target

POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not allowed.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
hotReload:
  sync:
    - target: "/app/src"
```
### `dockerfile`

POSIX-style name of Dockerfile, relative to project root. Defaults to $MODULE_ROOT/Dockerfile.

| Type | Required |
| ---- | -------- |
| `string` | No
### `services`

The list of services to deploy from this container module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `services.name`
[services](#services) > name

Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63 characters.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.dependencies`
[services](#services) > dependencies

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `services.outputs`
[services](#services) > outputs

Key/value map. Keys must be valid identifiers.

| Type | Required |
| ---- | -------- |
| `object` | No
### `services.args`
[services](#services) > args

The arguments to run the container with when starting the service.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `services.daemon`
[services](#services) > daemon

Whether to run the service as a daemon (to ensure only one runs per node).

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `services.ingresses`
[services](#services) > ingresses

List of ingress endpoints that the service exposes.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

Example:
```yaml
services:
  - ingresses:
    - path: /api
      port: http
```
### `services.ingresses.hostname`
[services](#services) > [ingresses](#services.ingresses) > hostname

The hostname that should route to this service. Defaults to the default hostname
configured in the provider configuration.

Note that if you're developing locally you may need to add this hostname to your hosts file.

| Type | Required |
| ---- | -------- |
| `string` | No
### `services.ingresses.path`
[services](#services) > [ingresses](#services.ingresses) > path

The path which should be routed to the service.

| Type | Required |
| ---- | -------- |
| `string` | No
### `services.ingresses.port`
[services](#services) > [ingresses](#services.ingresses) > port

The name of the container port where the specified paths should be routed.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.env`
[services](#services) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `services.healthCheck`
[services](#services) > healthCheck

Specify how the service's health should be checked after deploying.

| Type | Required |
| ---- | -------- |
| `object` | No
### `services.healthCheck.httpGet`
[services](#services) > [healthCheck](#services.healthcheck) > httpGet

Set this to check the service's health by making an HTTP request.

| Type | Required |
| ---- | -------- |
| `object` | No
### `services.healthCheck.httpGet.path`
[services](#services) > [healthCheck](#services.healthcheck) > [httpGet](#services.healthcheck.httpget) > path

The path of the service's health check endpoint.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.healthCheck.httpGet.port`
[services](#services) > [healthCheck](#services.healthcheck) > [httpGet](#services.healthcheck.httpget) > port

The name of the port where the service's health check endpoint should be available.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.healthCheck.httpGet.scheme`
[services](#services) > [healthCheck](#services.healthcheck) > [httpGet](#services.healthcheck.httpget) > scheme



| Type | Required |
| ---- | -------- |
| `string` | No
### `services.healthCheck.command`
[services](#services) > [healthCheck](#services.healthcheck) > command

Set this to check the service's health by running a command in its container.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `services.healthCheck.tcpPort`
[services](#services) > [healthCheck](#services.healthcheck) > tcpPort

Set this to check the service's health by checking if this TCP port is accepting connections.

| Type | Required |
| ---- | -------- |
| `string` | No
### `services.hotReloadArgs`
[services](#services) > hotReloadArgs

If this module uses the `hotReload` field, the container will be run with these arguments instead of those in `args` when the service is deployed with hot reloading enabled.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `services.ports`
[services](#services) > ports

List of ports that the service container exposes.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `services.ports.name`
[services](#services) > [ports](#services.ports) > name

The name of the port (used when referencing the port elsewhere in the service configuration).

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.ports.protocol`
[services](#services) > [ports](#services.ports) > protocol

The protocol of the port.

| Type | Required |
| ---- | -------- |
| `string` | No
### `services.ports.containerPort`
[services](#services) > [ports](#services.ports) > containerPort

The port exposed on the container by the running procces. This will also be the default value for `servicePort`.
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type | Required |
| ---- | -------- |
| `number` | Yes

Example:
```yaml
services:
  - ports:
      - containerPort: "8080"
```
### `services.ports.servicePort`
[services](#services) > [ports](#services.ports) > servicePort

The port exposed on the service. Defaults to `containerPort` if not specified.
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
services:
  - ports:
      - servicePort: "80"
```
### `services.ports.hostPort`
[services](#services) > [ports](#services.ports) > hostPort



| Type | Required |
| ---- | -------- |
| `number` | No
### `services.ports.nodePort`
[services](#services) > [ports](#services.ports) > nodePort

Set this to expose the service on the specified port on the host node (may not be supported by all providers).

| Type | Required |
| ---- | -------- |
| `number` | No
### `services.volumes`
[services](#services) > volumes

List of volumes that should be mounted when deploying the container.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `services.volumes.name`
[services](#services) > [volumes](#services.volumes) > name

The name of the allocated volume.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.volumes.containerPath`
[services](#services) > [volumes](#services.volumes) > containerPath

The path where the volume should be mounted in the container.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `services.volumes.hostPath`
[services](#services) > [volumes](#services.volumes) > hostPath



| Type | Required |
| ---- | -------- |
| `string` | No
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
### `tests.args`
[tests](#tests) > args

The arguments used to run the test inside the container.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
tests:
  - args:
    - npm
    - test
```
### `tests.env`
[tests](#tests) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `tasks`

A list of tasks that can be run from this container module. These can be used as dependencies for services (executed before the service is deployed) or for other tasks.

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
### `tasks.args`
[tasks](#tasks) > args

The arguments used to run the task inside the container.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
tasks:
  - args:
    - rake
    - 'db:migrate'
```

## Complete schema
```yaml
buildArgs:
  {}

image:

hotReload:
  sync:
    - source: .
      target:

dockerfile:

services:
  - name:
    dependencies:
      []
    outputs:
      {}
    args:
    daemon: false
    ingresses:
      - hostname:
        path: /
        port:
    env:
      {}
    healthCheck:
      httpGet:
        path:

        port:

        scheme: HTTP

      command:

      tcpPort:
    hotReloadArgs:
    ports:
      - name:
        protocol: TCP
        containerPort:
        servicePort: <containerPort>
        hostPort:
        nodePort:
    volumes:
      - name:
        containerPath:
        hostPath:

tests:
  - name:
    dependencies:
      []
    timeout: null
    args:
    env:
      {}

tasks:
  - name:
    description:
    dependencies:
      []
    timeout: null
    args:
```