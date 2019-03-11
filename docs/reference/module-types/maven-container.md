# `maven-container` reference

Below is the schema reference for the `maven-container` module type. For an introduction to configuring Garden modules, please look at our [Configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys

### `module`

Configuration for a container module.

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
### `module.build.targetImage`
[module](#module) > [build](#module.build) > targetImage

For multi-stage Dockerfiles, specify which image to build (see https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for details).

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.buildArgs`
[module](#module) > buildArgs

Specify build arguments to use when building the container image.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.image`
[module](#module) > image

Specify the image name for the container. Should be a valid Docker image identifier. If specified and the module does not contain a Dockerfile, this image will be used to deploy services for this module. If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.hotReload`
[module](#module) > hotReload

Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled services when those files or directories are modified. Applies to this module's services, and to services with this module as their `sourceModule`.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.hotReload.sync[]`
[module](#module) > [hotReload](#module.hotreload) > sync

Specify one or more source files or directories to automatically sync into the running container.

| Type | Required |
| ---- | -------- |
| `array[object]` | Yes
### `module.hotReload.sync[].source`
[module](#module) > [hotReload](#module.hotreload) > [sync](#module.hotreload.sync[]) > source

POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be a relative path if provided. Defaults to the module's top-level directory if no value is provided.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
module:
  ...
  hotReload:
    ...
    sync:
      - source: "src"
```
### `module.hotReload.sync[].target`
[module](#module) > [hotReload](#module.hotreload) > [sync](#module.hotreload.sync[]) > target

POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not allowed.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
module:
  ...
  hotReload:
    ...
    sync:
      - target: "/app/src"
```
### `module.dockerfile`
[module](#module) > dockerfile

POSIX-style name of Dockerfile, relative to project root. Defaults to $MODULE_ROOT/Dockerfile.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.services[]`
[module](#module) > services

The list of services to deploy from this container module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.services[].name`
[module](#module) > [services](#module.services[]) > name

Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63 characters.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].dependencies[]`
[module](#module) > [services](#module.services[]) > dependencies

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.services[].annotations`
[module](#module) > [services](#module.services[]) > annotations

Annotations to attach to the service (Note: May not be applicable to all providers)

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.services[].args[]`
[module](#module) > [services](#module.services[]) > args

The arguments to run the container with when starting the service.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.services[].daemon`
[module](#module) > [services](#module.services[]) > daemon

Whether to run the service as a daemon (to ensure only one runs per node).

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `module.services[].ingresses[]`
[module](#module) > [services](#module.services[]) > ingresses

List of ingress endpoints that the service exposes.

| Type | Required |
| ---- | -------- |
| `array[object]` | No

Example:
```yaml
module:
  ...
  services:
    - ingresses:
      - path: /api
        port: http
```
### `module.services[].ingresses[].annotations`
[module](#module) > [services](#module.services[]) > [ingresses](#module.services[].ingresses[]) > annotations

Annotations to attach to the ingress (Note: May not be applicable to all providers)

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.services[].ingresses[].hostname`
[module](#module) > [services](#module.services[]) > [ingresses](#module.services[].ingresses[]) > hostname

The hostname that should route to this service. Defaults to the default hostname
configured in the provider configuration.

Note that if you're developing locally you may need to add this hostname to your hosts file.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.services[].ingresses[].path`
[module](#module) > [services](#module.services[]) > [ingresses](#module.services[].ingresses[]) > path

The path which should be routed to the service.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.services[].ingresses[].port`
[module](#module) > [services](#module.services[]) > [ingresses](#module.services[].ingresses[]) > port

The name of the container port where the specified paths should be routed.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].env`
[module](#module) > [services](#module.services[]) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.services[].healthCheck`
[module](#module) > [services](#module.services[]) > healthCheck

Specify how the service's health should be checked after deploying.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.services[].healthCheck.httpGet`
[module](#module) > [services](#module.services[]) > [healthCheck](#module.services[].healthcheck) > httpGet

Set this to check the service's health by making an HTTP request.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.services[].healthCheck.httpGet.path`
[module](#module) > [services](#module.services[]) > [healthCheck](#module.services[].healthcheck) > [httpGet](#module.services[].healthcheck.httpget) > path

The path of the service's health check endpoint.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].healthCheck.httpGet.port`
[module](#module) > [services](#module.services[]) > [healthCheck](#module.services[].healthcheck) > [httpGet](#module.services[].healthcheck.httpget) > port

The name of the port where the service's health check endpoint should be available.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].healthCheck.httpGet.scheme`
[module](#module) > [services](#module.services[]) > [healthCheck](#module.services[].healthcheck) > [httpGet](#module.services[].healthcheck.httpget) > scheme



| Type | Required |
| ---- | -------- |
| `string` | No
### `module.services[].healthCheck.command[]`
[module](#module) > [services](#module.services[]) > [healthCheck](#module.services[].healthcheck) > command

Set this to check the service's health by running a command in its container.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.services[].healthCheck.tcpPort`
[module](#module) > [services](#module.services[]) > [healthCheck](#module.services[].healthcheck) > tcpPort

Set this to check the service's health by checking if this TCP port is accepting connections.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.services[].hotReloadArgs[]`
[module](#module) > [services](#module.services[]) > hotReloadArgs

If this module uses the `hotReload` field, the container will be run with these arguments instead of those in `args` when the service is deployed with hot reloading enabled.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.services[].ports[]`
[module](#module) > [services](#module.services[]) > ports

List of ports that the service container exposes.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.services[].ports[].name`
[module](#module) > [services](#module.services[]) > [ports](#module.services[].ports[]) > name

The name of the port (used when referencing the port elsewhere in the service configuration).

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].ports[].protocol`
[module](#module) > [services](#module.services[]) > [ports](#module.services[].ports[]) > protocol

The protocol of the port.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.services[].ports[].containerPort`
[module](#module) > [services](#module.services[]) > [ports](#module.services[].ports[]) > containerPort

The port exposed on the container by the running process. This will also be the default value for `servicePort`.
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type | Required |
| ---- | -------- |
| `number` | Yes

Example:
```yaml
module:
  ...
  services:
    - ports:
        - containerPort: "8080"
```
### `module.services[].ports[].servicePort`
[module](#module) > [services](#module.services[]) > [ports](#module.services[].ports[]) > servicePort

The port exposed on the service. Defaults to `containerPort` if not specified.
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
module:
  ...
  services:
    - ports:
        - servicePort: "80"
```
### `module.services[].ports[].hostPort`
[module](#module) > [services](#module.services[]) > [ports](#module.services[].ports[]) > hostPort



| Type | Required |
| ---- | -------- |
| `number` | No
### `module.services[].ports[].nodePort`
[module](#module) > [services](#module.services[]) > [ports](#module.services[].ports[]) > nodePort

Set this to expose the service on the specified port on the host node (may not be supported by all providers).

| Type | Required |
| ---- | -------- |
| `number` | No
### `module.services[].volumes[]`
[module](#module) > [services](#module.services[]) > volumes

List of volumes that should be mounted when deploying the container.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.services[].volumes[].name`
[module](#module) > [services](#module.services[]) > [volumes](#module.services[].volumes[]) > name

The name of the allocated volume.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].volumes[].containerPath`
[module](#module) > [services](#module.services[]) > [volumes](#module.services[].volumes[]) > containerPath

The path where the volume should be mounted in the container.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.services[].volumes[].hostPath`
[module](#module) > [services](#module.services[]) > [volumes](#module.services[].volumes[]) > hostPath



| Type | Required |
| ---- | -------- |
| `string` | No
### `module.tests[]`
[module](#module) > tests

A list of tests to run in the module.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.tests[].name`
[module](#module) > [tests](#module.tests[]) > name

The name of the test.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.tests[].dependencies[]`
[module](#module) > [tests](#module.tests[]) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.tests[].timeout`
[module](#module) > [tests](#module.tests[]) > timeout

Maximum duration (in seconds) of the test run.

| Type | Required |
| ---- | -------- |
| `number` | No
### `module.tests[].args[]`
[module](#module) > [tests](#module.tests[]) > args

The arguments used to run the test inside the container.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
module:
  ...
  tests:
    - args:
      - npm
      - test
```
### `module.tests[].env`
[module](#module) > [tests](#module.tests[]) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.tasks[]`
[module](#module) > tasks

A list of tasks that can be run from this container module. These can be used as dependencies for services (executed before the service is deployed) or for other tasks.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `module.tasks[].name`
[module](#module) > [tasks](#module.tasks[]) > name

The name of the task.

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `module.tasks[].description`
[module](#module) > [tasks](#module.tasks[]) > description

A description of the task.

| Type | Required |
| ---- | -------- |
| `string` | No
### `module.tasks[].dependencies[]`
[module](#module) > [tasks](#module.tasks[]) > dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.

| Type | Required |
| ---- | -------- |
| `array[string]` | No
### `module.tasks[].timeout`
[module](#module) > [tasks](#module.tasks[]) > timeout

Maximum duration (in seconds) of the task's execution.

| Type | Required |
| ---- | -------- |
| `number` | No
### `module.tasks[].args[]`
[module](#module) > [tasks](#module.tasks[]) > args

The arguments used to run the task inside the container.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
module:
  ...
  tasks:
    - args:
      - rake
      - 'db:migrate'
```
### `module.tasks[].env`
[module](#module) > [tasks](#module.tasks[]) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type | Required |
| ---- | -------- |
| `object` | No
### `module.jarPath`
[module](#module) > jarPath

The path to the packaged JAR artifact, relative to the module directory.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
module:
  ...
  jarPath: "target/my-module.jar"
```
### `module.jdkVersion`
[module](#module) > jdkVersion

The Java version to run

| Type | Required |
| ---- | -------- |
| `number` | No


## Complete YAML schema
```yaml
module:
  build:
    dependencies:
      - name:
        copy:
          - source:
            target: ''
    targetImage:
  buildArgs: {}
  image:
  hotReload:
    sync:
      - source: .
        target:
  dockerfile:
  services:
    - name:
      dependencies: []
      annotations: {}
      args:
      daemon: false
      ingresses:
        - annotations: {}
          hostname:
          path: /
          port:
      env: {}
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
      dependencies: []
      timeout: null
      args:
      env: {}
  tasks:
    - name:
      description:
      dependencies: []
      timeout: null
      args:
      env: {}
  jarPath:
  jdkVersion: 8
```
