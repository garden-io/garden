# Remote/Local Hybrid

A simple project based on the [demo-project](../demo-project/README.md) example that demonstrates a hybrid setup where some services run remotely and others locally.

The motivation for running local services with Garden is to be able to share environment variables and other configuration.

> Note that we'll be adding native support for this workflow in the near future which avoids having to run the local module in a separate process, supports logs, and more.

## Project Structure

The project contains three modules: `backend`, `frontend`, and `frontend-local`, which as the name suggests, runs the frontend locally.

The `frontend` module declares a variable which holds its env vars so that they can be shared with the local module:

```yaml
# in frontend/garden.yml
kind: Module
name: frontend
# ..
variables:
  env: # <--- Declare as a variable so that we can re-use it
    PORT: 8080
    IS_LOCAL: false
services:
  - name: frontend
    # ...
    env: ${var.env} # <--- Reference the 'env' variable
```

The `frontend-local` module is a "local" `exec` module that can re-use the variables defined for the `frontend` module to avoid duplication:

```yaml
# also in frontend/garden.yml
kind: Module
name: frontend-local
type: exec
local: true
env:
  $merge: ${modules.frontend.var.env} # <--- Merge in the variables from the `frontend` module
  IS_LOCAL: true # <--- Overwrite the IS_LOCAL variable
```

And in the code itself, we use the `IS_LOCAL` variable:

```javascript
// In frontend/app.js
app.get('/hello-frontend', (_req, res) => {
  const msg = process.env.IS_LOCAL ? "Hello from local frontend" : "Hello from remote frontend"
  res.send(msg)
});
```

## Usage

**First**, deploy the project with:

```console
garden deploy
```

This deploys both the `backend` and `frontend` services into a remote K8s cluster.

**Next**, start the local module in a separate process with:

```console
garden run module frontend-local "yarn dev"
```

Note that you can pass any arbitrary command to the Garden command.

This simply runs `yarn dev` in the build context of the frontend module with the correct environment variables set.

Now, if you go to the remote ingress for the frontend you should see:

```console
Hello from remote frontend
```

However, if you go to `localHost:8080/hello-frontend` you should see:

```console
Hello from local frontend
```

## Advanced

It's also possible to run local services with `garden deploy` or `garden dev` by using the [`services` spec](https://docs.garden.io/reference/module-types/exec#services) on `exec` modules.

However, it requires a bit of work, since currently Garden will wait for the process to exit (which never happens for long running processes).

You can conceptually work around this by doing the following:

1. Write a script that runs the process in the background and stores the PID, and call it via the [`deployCommand` field](https://docs.garden.io/reference/module-types/exec#services-.deploycommand).
2. Have another script for killing the process based on the store PID and call it via the [`cleanupCommand` field](https://docs.garden.io/reference/module-types/exec#services-.cleanupcommand).
3. Optionally use the [`statusCommand` field](https://docs.garden.io/reference/module-types/exec#services-.statuscommand) to skip running the process if it's already running.

Obviously, this is a bit convoluted, and adding Garden native support for this workflow is on our short-term roadmap.