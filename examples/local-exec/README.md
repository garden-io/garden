# Local Exec (Executing local commands with Garden)

> Note: You need to have Go installed to run this project.

This example project demonstrates how you can use the `exec` module type to run build commands, tasks and tests in the module directory, by setting `local: true` in the module config. By default the commands are executed in the `.garden/build` directory.

The idea is to use a local `exec` module to run pre-build commands for a container module.

## Project Structure

The project consists of a `builder` module and a `backend` module. Both modules are in the same `garden.yml` file in the `backend` directory.

The `backend` module is a simple `container` module that acts as a web server written in Go. The corresponding Dockerfile expects the web server binary to already be built before adding it to the image.

To achieve this, we add a `go build` command to the `builder` module, set `local: true`, and then declare it as a build dependency in the `backend` module. We also tell Garden to copy the built binary to the `backend` build context since we're git ignoring it. This way, it's available with rest of the `backend` build context at `./garden/build/backend`. These are the relevant parts of the config

```yaml
# backend/garden.yml
kind: Module
type: exec
local: true
...
build:
  command: [go, build, -o, bin/backend]
---
kind: Module
type: container
build:
  dependencies:
    - name: builder
      copy:
        - source: bin
          target: .
...
```

This ensures that Garden runs `go build` in the module directory before it attempts to build the Docker image for the `backend` module.

## Usage

Run `garden deploy` to deploy the project. You'll notice that Garden first builds the Go binary, before it's added to the container image.
