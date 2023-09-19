# conftest example

This simple example shows you how you can easily drop [conftest](https://github.com/open-policy-agent/conftest) into your project to validate your Kubernetes manifests.

The [project config](./garden.yml) contains a single line that automatically creates a `conftest` test for each `kubernetes` and `helm` module in your project:

```yaml
apiVersion: garden.io/v1
kind: Project
name: conftest
environments:
  - name: local
providers:
  - name: local-kubernetes
  - name: conftest-kubernetes # <------
```

For the example, we've copied the [kubernetes example](https://github.com/open-policy-agent/conftest/tree/master/examples/kubernetes) from the conftest repository, and added a `helm` module type for good measure.

To test this, simply run `garden test` in this directory. You should quickly see a few tests failing because resources don't match the policies defined under the `policy` directory.

Note that you could also manually specify tests using the [conftest Test action type](https://docs.garden.io/reference/action-types/test/conftest).
