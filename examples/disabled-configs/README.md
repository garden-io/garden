# Disabled configs example project

A simple variation on the [demo-project](https://github.com/garden-io/garden/blob/main/examples/demo-project/README.md) where the `backend` actions, and the `frontend-integ` test action are disabled for the `local` environment.

The `backend` build action config then looks like this:

```yaml
# in backend/garden.yml
kind: Build
name: backend
type: container
disabled: ${environment.name == local}
# ...
```

And the `frontend` config like this:

```yaml
# in frontend/garden.yml
kind: Test
name: frontend-integ
type: container
environments: [remote] # <- Here we use the environments field instead of the expression above
# ...
spec:
  command: [npm, run, integ]

# ...
```
