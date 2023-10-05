---
title: Exec (local scripts)
order: 2
---

# Exec

The `exec` plugin and corresponding `exec` actions allow you to run commands locally on the host (e.g. your laptop
or your CI runner).

This plugin is built-in which means you don't need to specify it in your project configuration. You can simply add `exec`
actions right away.

It's great for running auth scripts as well as executing various scaffolding scripts that need to run "locally".

It can also be used to start applications locally (e.g. by executing commands like `npm run dev`).

This can be very useful for hybrid environments where you have, say, your backend running in a remote production-like
environment but your frontend running locally.

## Plugin Configuration

Usually you don't need to configure the `exec` plugin because it's built-in and you can use `exec` actions directly.

However, it can be used to run init scripts ahead of other Garden execution. This is useful if you need to
authenticate against a remote environment before Garden initializes other plugins.

Another set of popular use-cases are local build flows for shared libraries ahead of Docker builds, along with any
sort of glue script you may need between steps.

Here's an example where we run a script to authenticate against a Kubernetes cluster before initializing the Kubernetes
plugin:

```yaml
# In your project level Garden config file
apiVersion: garden.io/v1
kind: Project
name: my-project

providers:
  - name: exec
    initScript: "sh -c ./scripts/auth.sh"
  - name: kubernetes
    dependencies: [ exec ] # <--- This ensures the init script runs before the K8s plugin is initialized.
    # ...
```

The log output of the `initScript` can be accessed via `"${providers.exec.outputs.initScript.log}"` template string.

## Action Configuration

### Exec Runs

Following are some example `exec` Run actions for executing various scripts:

```yaml
kind: Run
name: auth
type: exec
include: [ ] # <--- No source files are needed
spec:
  command: [ "sh", "-c", "./scripts/auth.sh" ]

---
kind: Run
name: prepare-data
type: exec
include: [ ]
spec:
  command: [ "sh", "-c", "./scripts/prepare-data-locally.sh" ]
```

Other actions can depend on these Runs:

```yaml
kind: Run
name: db-init
type: exec
dependencies: [ run.auth, run.prepare-data ]
spec:
  command: [ npm, run, db-init ]
```

It's also possible to reference the output from `exec` actions:

```yaml
kind: Deploy
name: postgres
type: container
spec:
  image: postgres:15.3-alpine
  ports:
    - name: db
      containerPort: 5432
  env:
    POSTGRES_DATABASE: postgres
    POSTGRES_USERNAME: postgres
    POSTGRES_PASSWORD: ${actions.run.auth.outputs.log}
```

### Local services

The `exec Deploy` action type can also be used to start long-running processes:

```yaml
kind: Deploy
name: web-local
type: exec
spec:
  persistent: true
  deployCommand: [ "npm", "run", "dev" ] # <--- This is the command Garden runs to start the process in persistent mode.
```

Set `spec.persistent: true` if the `spec.deployCommand` is not expected to return, and should run until the Garden
command is manually terminated. The `spec.persistent` flag replaces the previously supported `devMode` from [`exec`
_modules_](../reference/module-types/exec.md).

See the [reference guide](../reference/action-types/Deploy/exec.md) for more details on the `exec Deploy` action
configuration.

Also check out the [local-service example project](../../examples/local-service).

## Next Steps

For some advanced `exec` _module_ use cases, check out [this recording](https://www.youtube.com/watch?v=npE0FWJwcno) of
our community office hours on the topic.
