# Build Dependencies

This example project demonstrates how to use build dependencies to include files and directories from outside a module's root with its build context. For example, some .NET and Java projects that are split up into multiple modules need a shared configuration file at build time for each module.

Another common use case is to use build dependencies to include shared libraries with multiple modules. Our [`openfaas` example project](../openfaas) demonstrates this same pattern with an NPM package.

To achieve this, we:

1. wrap the shared files/directories in an `exec` module
2. reference it in the [build dependency](https://docs.garden.io/reference/module-types/container#build-dependencies) field of the consuming modules.

## Project Structure

The project consists of a `shared-config` module of type `exec`, and two container modules, `frontend` and `backend`, that have a build dependency on the `shared-config` module.

The `shared-config` module contains a single `config.env` file and the following Garden config:

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
│   └── config.env # <--- The shared config file
├── Dockerfile
├── app.js
├── ...
```

This is the build context Garden will use when building the `frontend` module.

In this example there's no "build" step for the `exec` module, but you can add it via the `build` field. Check out our [`local-exec` project](../local-exec/backend/garden.yml) for an example of this.

## Usage

Run `garden deploy` to deploy the project. You can verify that it works by running:

```sh
garden call frontend
```

It'll print the contents of the `shared-config/config.env` file:

```sh
Call 📞

✔ providers                 → Getting status... → Done
✔ Sending HTTP GET request to http://eysi-build-dependencies.dev-1.sys.garden/hello-frontend

200 OK

Config says: Hello World
```
