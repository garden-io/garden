# Local Exec (Executing local commands with Garden)

> Note: You need to have Go installed to run this project.

This example project demonstrates how you can use the `exec` action type to run various actions (e.g. Build, Run, and Test) from the action directory, by setting `buildAtSource: true` in the action config. By default, the commands are executed in the `.garden/build` directory.

The idea is to use a local `exec` action type to run pre-build commands for a `container` build action.

## Project Structure

The project consists of a `builder` build action of type `exex` and 2 `backend` actions of type `container`: build and deploy. All actions are defined in the same `garden.yml` file in the `backend` directory.

The `backend` application acts as a web server written in Go. The corresponding Dockerfile expects the web server binary to already be built before adding it to the image.

To achieve this, we add a `go build` command to the `builder` action, set `buildAtSource: true`, and then declare it as a dependency in the `backend` build action. We also tell Garden to copy the built binary to the `backend` build context since we're git ignoring it. This way, it's available with rest of the `backend` build context at `./garden/build/backend`. These are the relevant parts of the config

```yaml
# backend/garden.yml
kind: Build
type: exec
buildAtSource: true
...
spec:
  command: [go, build, -o, bin/backend]
---
kind: Build
type: container
dependencies:
  - build.builder
copyFrom:
  - build: builder
    sourcePath: bin
    targetPath: .
...
```

This ensures that Garden runs `go build` in the action directory before it attempts to build the Docker image for the `backend` build action.

## Usage

Run `garden deploy` to deploy the project. You'll notice that Garden first builds the Go binary, before it's added to the container image.
