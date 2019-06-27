# `kubernetes` module type example

This is a simple example demonstrating the `kubernetes` module type.
The `kubernetes` module type is useful when you want to deploy your own manifests to Kubernetes, but don't need the
features (and complexity) of `helm` modules.

This example contains a `redis` module and a `postgres` module. Both contain manifests that are, for the purposes of
this example, rendered from their respective official Helm charts (by running the `helm template` command).

The `redis` module has its manifests in a separate YAML file, whereas the `postgres` module has the manifests inlined
in the `garden.yml` file, which allows us to use template strings to set variable values.
We set the Postgres instance password through a variable in the project `garden.yml` to demonstrate that capability.

To give it a spin, just run `garden deploy` in the module directory.

To see that the Postgres password was correctly set, run `kubectl -n kubernetes-module get secret postgres -o yaml`
and check that the password matches the one in the project `garden.yml` file.

## Further reading

There's not much more to it, but you can check out the module type
[reference](https://docs.garden.io/reference/module-types/kubernetes) for more details.
