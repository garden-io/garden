# `kubernetes` module type with kustomize

This demonstrates how to use [kustomize](https://github.com/kubernetes-sigs/kustomize) with the `kubernetes` module type.

The example includes two modules:

* `hello-world` copies kustomize's [helloWorld example](https://github.com/kubernetes-sigs/kustomize/blob/8f56f513075996723891e4781ff2e409a1ac169d/examples/helloWorld/README.md)
* `ldap` copies kustomize's [ldap example](https://github.com/kubernetes-sigs/kustomize/blob/ee2228c5fcf79cc3a67984a9f583154e5ff12db1/examples/ldap/README.md), which showcases how to use _overlays_. The only modification is to change the names of the overlays to match the project environment names.

See `hello-world/garden.yml` and `ldap/garden.yml` to see how to configure Garden to use kustomize.

To run the example, simply run `garden deploy` with a local Kubernetes cluster running. Also make sure your local k8s provider supports a loadbalancer service.

## Further reading

Check out the module type [reference](https://docs.garden.io/reference/module-types/kubernetes) for more details.
