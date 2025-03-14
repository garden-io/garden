---
title: Local scripts
order: 5
---

You can run scripts locally on the host (e.g. your laptop or your CI runner) with the `exec` action.

A common use case is running auth scripts as well as executing various scaffolding scripts that need to run "locally".

It can also be used to start applications locally (e.g. by executing commands like `npm run dev`).

This can be very useful for hybrid environments where you have, say, your backend running in a remote production-like
environment but your frontend running locally.

## Provider Configuration

Usually you don't need to configure the `exec` provider because it's built-in and you can use `exec` actions directly.

However, it can be used to run init scripts ahead of other Garden execution. This is useful if you need to authenticate against a remote environment before Garden initializes other plugins.

Here's an example where we run a script to authenticate against a Kubernetes cluster before initializing the Kubernetes plugin:

```yaml
# In your project level Garden config file
apiVersion: garden.io/v1
kind: Project
name: my-project

providers:
  - name: exec
    initScript: "sh -c ./scripts/auth.sh"
  - name: kubernetes
    dependencies: [exec] # <--- This ensures the init script runs before the K8s plugin is initialized.
    # ...
```

The log output of the `initScript` can be accessed via `"${providers.exec.outputs.initScript.log}"` template string.

## Actions

### Build

A Build action which executes a build command "locally" on the host.

This is commonly used together with exec Deploy actions when a local build step needs to be executed first.

{% hint style="info" %}
Note that by default, Garden will "stage" the build to the `./garden` directory and execute the
build there. This is to ensure that the command doesn't mess with your local project
files. You can disable that by setting `buildAtSource: true`.
{% endhint %}

For example:

```yaml
# In ./lib
kind: Build
name: lib-local
type: exec
buildAtSource: true # <--- Here we want execute the build in the ./lib dir directly
spec:
  command: [npm, run, build]
---
# In ./web
kind: Deploy
name: web-local
type: exec
dependencies: [build.lib-local] # <--- Build lib before starting local dev server
persistent: true
spec:
  deployCommand: [npm, run, dev]
```

Another common use case is to prepare a set of files, say, manifests ahead of a deployment. In
this case we choose to execute the script in the `./garden` directory so that it doesn't affect
our version controlled source code.

That's why we also need to set the `build` field on the Deploy action.

```yaml
# In ./manifests dir
kind: Build
name: prepare-manifests
type: exec
spec:
  command: [./prepare-manifests.sh]
---
kind: Deploy
name: api
type: kubernetes
build: prepare-manifests # <--- This tells Garden to use the build directory for the 'prepare-manifests' action as the source for this action.
dependencies: [build.prepare-manifests]
```

### Deploy

A Deploy action which executes a deploy command "locally" on the host.

This is commonly used for hybrid environments where you e.g. deploy your backend services
to a remote Kubernetes cluster but run your web service locally.

If you're starting a long running local process, you need to set `persistent: true`. Note
that you can also specify a `statusCommand` that tells Garden when the command should
be considered ready and a `cleanupCommand` that's executed when running the Garden `cleanup`
command.

For example:

```yaml
# In ./api
kind: Deploy
name: api
type: kubernetes
# ...
# In ./web
kind: Deploy
name: web
type: exec
spec:
  persistent: true
  deployCommand: [npm, run, dev]
  statusCommand: [./is-ready.sh] # <--- Garden checks the status at an interval until the command returns 0 or times out
  cleanupCommand: [npm, run, clean]
```

You'll find a complete example of this in our [local-service example project](../../examples/local-service).

{% hint style="info" %}
If you need your local service to _receive_ traffic from the remote parts of your system
you can use [Garden's local mode functionality](https://docs.garden.io/v/docs-edge-2/guides/running-service-in-local-mode).
{% endhint %}

### Run and Test

Similar to the Build action, the Run and Test actions can also be used to run one-off local commands.

Following are some example `exec` Run actions for executing various scripts:

```yaml
kind: Run
name: auth
type: exec
spec:
  command: ["sh", "-c", "./scripts/auth.sh"]

---
kind: Run
name: prepare-data
type: exec
spec:
  command: ["sh", "-c", "./scripts/prepare-data-locally.sh"]
```

Other actions can depend on these Runs:

```yaml
kind: Run
name: db-init
type: exec
dependencies: [run.auth, run.prepare-data]
spec:
  command: [npm, run, db-init]
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

## Next Steps

For some advanced `exec` use cases, check out [this recording](https://www.youtube.com/watch?v=npE0FWJwcno) of
our community office hours on the topic.
