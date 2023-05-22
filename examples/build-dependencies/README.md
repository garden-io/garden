# Build Dependencies

This example project demonstrates how to use build dependencies to include files and directories from outside an action's root with its build context.
The frontend application is also [configured for sync](frontend/garden.yml#L27-L37) to show how to synchronize the dependency with the rest of the code.

Benefits of this feature can be utilized by .NET or Java projects that are split up into multiple actions need a shared configuration file at build time for each action.

Another common use case is to use build dependencies to include shared config files or libraries with multiple actions.

To achieve this, we:

1. wrap the shared files/directories in an `exec` build action
2. reference it in the [`dependencies` section](../../docs/reference/action-types/Build/exec.md) field of the consuming actions.

## Project Structure

The project consists of a `shared-config` build action of type `exec`, and two applications of type `container`, `frontend` and `backend`, that have a build dependency on the `shared-config` build action.

The `shared-config` build action contains a single [config.json](shared-config/config.json) file and the following [Garden config](shared-config/garden.yml):

```yaml
# shared-config/garden.yml
kind: Build
name: shared-config
type: exec
```

The `build` config for both the `frontend` and `backend` looks like this:

```yaml
# frontend/garden.yml (same for backend/garden.yml)
dependencies:
  - build.shared-config

copyFrom:
  - build: shared-config
    sourcePath: "config.json"
    targetPath: "config/"
```

This tells Garden to first execute the `shared-config` build action, then to copy the contents from the `source` path *in the `shared-config` action's base path* to the `target` path *in the `frontend` action's base path*.

Note that this takes place inside the `.garden/build` directory. For example, if you run `garden build frontend` and then look at the folder structure of the `.garden/build` directory, you'll see:

```console
$ tree .garden/build/frontend -L 2

.garden/build/frontend
├── config
│   └── config.json # <--- The shared config file
├── Dockerfile
├── app.js
├── ...
```

This is the build context Garden will use when building the `frontend` application.

In this example there's no "build" step for the `exec` action type, but you can add it via the `spec.build` field. Check out our [`local-exec` project](../local-exec/README.md) for an example of this.

## Usage

Run `garden deploy` to deploy the project. You can verify that it works by opening the displayed ingress URLs.

Each response will contain the contents of the `shared-config/config.json` file:

```
Config says: This message comes from the shared config file!
```
