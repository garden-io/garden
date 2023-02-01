---
title: Exec (local scripts)
order: 2
---

# Exec

The `exec` plugin and corresponding `exec` module type allow you to run commands locally on the host (e.g. your laptop or on your CI runner).

It's built-in which means you don't need to specify it in the project level configuration and you can simply add `exec` modules right away.

It's great for running auth scripts as well as executing various scaffolding scripts that need to run "locally".

It can also be used to start services locally (e.g. by executing commands like `yarn dev`). 

This can be very useful for hybrid environments where you have, say, your backend running in a remote production-like environment but your frontend running locally. 

## Plugin Configuration

Usually you don't need to configure the exec plugin because it's built-in and you can use exec modules directly. 

However, it can be used to run init scripts ahead of other Garden execution. This is e.g. useful if you need to authenticate against a remote environment before Garden initializes other plugins. 

Here's an example where we run a script to authenticate against a Kubernetes cluster before initializing the Kubernetes plugin:

```yaml
# In your project level Garden config file
kind: Project
name: my-project

providers:
  - name: exec
    initScript: [./scripts/auth.sh]
  - name: kubernetes
    dependencies: [exec] # <--- This ensures the init script runs before the K8s plugin is initialized.
    # ...
```

## Module Configuration

### Exec tasks

Here's an example configuration for an exec module that's used for running various scripts:

```yaml
kind: Module
name: scripts
type: exec
local: true # <--- Run the script relative to the source dir (don't worry about this)
include: [] # <--- No source files are needed
tasks: # <--- The scripts are defined as exec tasks
  - name: authenticate
    command: [./scripts/auth.sh]
  - name: prepare-data
    command: [./scripts/prepare-data-locally.sh]
```

Other actions can depend on these tasks:

```yaml
kind: Module
name: api
type: kubernetes

dependencies: [authenticate]
tasks:
  - name: db-init
    command: [yarn, run, db-init]
    dependencies: [prepare-data]
```

It's also possible to reference the output from exec module tasks:

```yaml
kind: Module
name: api
type: container
services:
  env:
    AUTH_KEY: ${runtime.tasks.authenticate.outputs.log}
```

### Local services

The exec module can also be used to start long running services like so:

```yaml
kind: Module
name: web-local
type: exec 
local: true
include: []
services:
  - name: web-local
    devMode:
      command: ["yarn", "run", "dev"] # <--- This is the command Garden runs to start the process in dev mode
      statusCommand: [./check-local-status.sh] # <--- Optionally set a status command that checks whether the local service is ready
    deployCommand: [] # <--- A no op since we only want to deploy it when we're in dev mode
    env: ${modules.frontend.env} # <--- Reference the env variable defined above
```

See also this [example project](https://github.com/garden-io/garden/tree/0.12.49/examples/local-service).

## Next Steps

For some advanced exec use cases, check out [this recording](https://www.youtube.com/watch?v=npE0FWJwcno) of our community office hours on the topic.
