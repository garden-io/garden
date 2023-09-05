# `kubernetes` Deploy action type example

This is a simple example demonstrating the `kubernetes` action type.
The `kubernetes` action type is useful when you want to deploy your own manifests to Kubernetes, but don't need the
features (and complexity) of `helm` action type.

This example contains the configuration for 2 applications: a `redis` and a `postgres`, each located in its own directory.
Both contain manifests that are, for the purposes of this example, rendered from their respective official Helm charts
(by running the `helm template` command).

The `redis` application has its manifests in a separate YAML file, whereas the `postgres` application has the manifests inlined
in the `garden.yml` file, which allows us to use template strings to set variable values.
We set the Postgres instance password through a variable in the project `garden.yml` to demonstrate that capability.

To give it a spin, just run `garden deploy` in the project root directory.

To see that the Postgres password was correctly set, run `kubectl -n kubernetes-deploy-default get secret postgres -o yaml`
and check that the password matches the one in the project `garden.yml` file.

## Further reading

There's not much more to it, but you can check out the action type
[reference](../../docs/reference/action-types/Deploy/kubernetes.md) for more details.
