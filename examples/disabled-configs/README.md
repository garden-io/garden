# Disabled configs example project

A simple variation on the [demo-project](https://github.com/garden-io/garden/blob/master/examples/demo-project/README.md) where the `backend` module, and the `integ` test in the `frontend` module, are disabled for the `local` environment.

The `backend` config then looks like this:

```yaml
# in backend/garden.yml
kind: Module
name: backend
type: container
disabled: ${environment.name == local}
# ...
```

And the `frontend` config like this:

```yaml
# in frontend/garden.yml
kind: Module
name: frontend
type: container
# ...
tests:
  - name: integ
    args: [npm, run, integ]
    disabled: ${environment.name == local}
# ...
```
