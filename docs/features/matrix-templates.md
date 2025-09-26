
# Matrix templates

You can use a combination of `ConfigTemplate` and `RenderTemplate` configs to create multiple parameterized instances of actions.

Some typical examples would be splitting execution of test suites into segments, or building for multiple platforms or architectures in parallel.

Here's a quick example to illustrate:

```yaml
kind: ConfigTemplate
name: dist

inputs:
  os:
    type: string
  arch:
    type: string

configs:
  - kind: Build
    type: exec
    # Note: ${parent.name} resolves to the name of the RenderTemplate config below
    name: ${parent.name}-${inputs.os}-${inputs.arch}
    spec:
      command: ["./build.sh", "${inputs.os}", "${inputs.arch}"]

---

kind: RenderTemplate
name: dist
template: dist
matrix:
  os: ["linux", "macos"]
  arch: ["amd64", "arm64"]

```

Here we define a `ConfigTemplate` that accepts a couple of different inputs, then we render this template with `RenderTemplate` to create four different actions, one for each combination of `os` and `arch`.

To run all the builds, simply run `garden build`. You could also run specific builds with e.g. `garden build dist-linux-amd64` in this particular example, since a named action is created for each combination of inputs.

The `matrix` field should contain one or more keys, mapping to the specified inputs on the `ConfigTemplate` (which also supports more complex JSON object schemas using the `inputsSchemaPath` field).

Note that you can also supply a single input in the `matrix` field, in which case one action will be created for each value in that array. For example:

```yaml
kind: ConfigTemplate
name: build-image
inputs:
  shard:
    description: A shard number represents a specific 10th of the full test suite
    type: number
configs:
  - kind: Test
    type: container
    name: ${parent.name}-${inputs.shard}
    spec:
      command: ["./test.sh", "--shard", "${inputs.shard}"]

# Render the e2e-test ConfigTemplate 10 times with shards [1, 2, 3, ... 10]
kind: RenderTemplate
name: e2e-test
template: e2e-test
matrix:
  shard: ${range(1, 10)}
```

**Important:** You must make sure that the template inputs are used in the names of the actions under `configs`. Otherwise name clashes will result in a configuration validation error. The above examples illustrate the typical templating (e.g. `${parent.name}-${inputs.os}-${inputs.arch}`).

For more on config templates, please see the [Config Templates guide](./config-templates.md).
