---
title: Exec (local scripts)
order: 2
---

# Exec

The `exec` plugin and corresponding `exec` action type allow you to run commands locally on the host (e.g. your laptop
or on your CI runner).

It's built-in which means you don't need to specify it in the project level configuration and you can simply add `exec`
actions right away.

It's great for running auth scripts as well as executing various scaffolding scripts that need to run "locally".

It can also be used to start applications locally (e.g. by executing commands like `yarn dev`).

This can be very useful for hybrid environments where you have, say, your backend running in a remote production-like
environment but your frontend running locally.

## Plugin Configuration

Usually you don't need to configure the `exec` plugin because it's built-in and you can use `exec` actions directly.

However, it can be used to run init scripts ahead of other Garden execution. This is useful if you need to
authenticate against a remote environment before Garden initializes other plugins.

Here's an example where we run a script to authenticate against a Kubernetes cluster before initializing the Kubernetes
plugin:

```yaml
# In your project level Garden config file
apiVersion: garden.io/v1
kind: Project
name: my-project

providers:
  - name: exec
    initScript: [ "sh", "-c", "./scripts/auth.sh" ]
  - name: kubernetes
    dependencies: [ exec ] # <--- This ensures the init script runs before the K8s plugin is initialized.
    # ...
```

## Action Configuration

### Exec tasks

Here's an example configuration for an `exec` actions that's used for running various scripts:

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

Other actions can depend on these tasks:

```yaml
kind: Run
name: db-init
type: exec
dependencies: [ run.auth, run.prepare-data ]

spec:
  command: [ yarn, run, db-init ]
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

The `exec` action type can also be used to start long-running processes like so:

```yaml
kind: Module
name: web-local
type: exec
local: true
include: [ ]
services:
  - name: web-local
    syncMode:
      command: [ "yarn", "run", "dev" ] # <--- This is the command Garden runs to start the process in sync mode
      statusCommand: [ ./check-local-status.sh ] # <--- Optionally set a status command that checks whether the local service is ready
    deployCommand: [ ] # <--- A no op since we only want to deploy it when we're in sync mode
    env: ${modules.frontend.env} # <--- Reference the env variable defined above
```

See also this [example project](../../examples/local-service).

## Next Steps

For some advanced `exec` use cases, check out [this recording](https://www.youtube.com/watch?v=npE0FWJwcno) of our
community office hours on the topic.
