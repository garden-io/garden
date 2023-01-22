# Build Dependencies

This example project demonstrates how to use build dependencies to include files and directories from outside a module's root with its build context.
The frontend module is also [configured for dev-mode](frontend/garden.yml#L13-L23) to show how to synchronize the dependancy with the rest of the code.

Benefits of this feature can be utilized by .NET or Java projects that are split up into multiple modules need a shared configuration file at build time for each module.

Another common use case is to use build dependencies to include shared config files or libraries with multiple modules.

To achieve this, we:

1. wrap the shared files/directories in an `exec` module
2. reference it in the [build dependency](https://docs.garden.io/reference/module-types/container#build-dependencies) field of the consuming modules.

## Project Structure

The project consists of a `shared-config` module of type `exec`, and two container modules, `frontend` and `backend`, that have a build dependency on the `shared-config` module.

The `shared-config` module contains a single [config.json](shared-config/config.json) file and the following [Garden config](shared-config/garden.yml):

```yaml
# shared-config/garden.yml
kind: Module
name: shared-config
type: exec
```

The `build` config for both the `frontend` and `backend` looks like this:

```yaml
# frontend/garden.yml (same for backend/garden.yml)
build:
  dependencies:
    - name: shared-config
      copy:
        - source: "config.env"
          target: "config/"
```

This tells Garden to first "build" the `shared-config` module, then to copy the contents from the `source` path *in the `shared-config` module* to the `target` path *in the `frontend` module*.

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

This is the build context Garden will use when building the `frontend` module.

In this example there's no "build" step for the `exec` module, but you can add it via the `build` field. Check out our [`local-exec` project](../local-exec/README.md) for an example of this.

## Usage

Run `garden deploy` to deploy the project. You can verify that it works by opening the displayed ingress URL.

It'll print the contents of the `shared-config/config.json` file:

```sh
Call 📞

✔ providers                 → Getting status... → Done
✔ Sending HTTP GET request to http://eysi-build-dependencies.dev-1.sys.garden/hello-frontend

200 OK

Config says: This message comes from the shared config file!
```
