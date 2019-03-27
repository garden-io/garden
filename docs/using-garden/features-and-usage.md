# Features and Usage

Now that you've had a glimpse of the basic Garden commands in the [Quick Start](../basics/quick-start.md) guide, and
learned about the [Stack Graph](../basics/stack-graph.md), let's go through some typical Garden workflows.

## Starting a new project

To start a new Garden project, you create a `garden.yml` file in the top-level directory of your project's Git repository.
At its simplest, the project level `garden.yml` file looks something like this:

```yaml
# examples/demo-project/garden.yml
kind: Project
name: demo-project
environments:
  - name: local
    providers:
      - name: local-kubernetes
```

You then add a `garden.yml` file at the root directory of every module in your project. Commonly, a module corresponds to a single container, Helm chart, or serverless function. A module-level `garden.yml` file looks something like this:

```yaml
# examples/demo-project/backend/garden.yml
kind: Module
name: backend
description: Backend service container
type: container
services:
  - name: backend
    ports:
      - name: http
        containerPort: 8080
        servicePort: 80
    ingresses:
      - path: /hello-backend
        port: http
```

To learn more about how to configure a Garden project, please take a look at our [Configuration files](./configuration-files.md) guide.

For a practical example of "Gardenifying" an existing project, check out the [Demo Project](../examples/demo-project.md) example.

## The development workflow

After the configuration files are set, the development workflow when using Garden is usually very simple: you leave `garden dev` running, and Garden will automatically re-build, re-deploy, and re-test your project as you work on it. If we run `garden dev` inside the [Demo Project](../examples/demo-project.md) example, the output should be something like this:

```
Good evening! Let's get your environment wired up...

✔ frontend              → Getting build status... → Done (took 0.3 sec)
✔ backend                → Getting build status... → Done (took 0.2 sec)
✔ backend                → Deploying version v-9cfd748cd2... → Done (took 4.2 sec)
    ℹ backend                → Service deployed
    → Ingress: http://demo-project.local.app.garden/hello-backend
✔ frontend              → Running unit tests → Success (took 3.4 sec)
✔ frontend              → Deploying version v-9cfd748cd2... → Done (took 7.3 sec)
    ℹ frontend              → Service deployed
    → Ingress: http://demo-project.local.app.garden/hello-frontend
    → Ingress: http://demo-project.local.app.garden/call-backend
✔ frontend              → Running integ tests → Success (took 4.3 sec)
🌻  Garden dashboard and API server running on http://localhost:59636

🕑  Waiting for code changes
```

Now, let's change `frontend/app.js` (e.g. by adding a newline somewhere). This should result in something like the following being appended to the log of the `garden dev` command we started above:

```
✔ frontend              → Building frontend:v-9cfd748cd2-1553707229... → Done (took 1.4 sec)
✔ frontend              → Deploying version v-9cfd748cd2-1553707229... → Done (took 8 sec)
    ℹ frontend              → Service deployed
    → Ingress: http://demo-project.local.app.garden/hello-frontend
    → Ingress: http://demo-project.local.app.garden/call-backend
✔ frontend              → Running unit tests → Success (took 3.5 sec)
✔ frontend              → Running integ tests → Success (took 4.4 sec)

🕑  Waiting for code changes

````
As we can see, `frontend` was rebuilt, redeployed, and its unit & integration tests re-run.

Sometimes though, you might prefer to skip the testing step, in which case you can simply use `garden deploy --watch`. This will watch for changes, then build and deploy them, but it'll skip testing.

Lastly, when things go wrong you should refer to the error logs. These consist of an `error.log` file in the project root, along with the service logs that you can retrieve from the individual pods in your cluster.

For the latter, you can use the `garden logs` command, followed by the name of the service you'd like to query. For example `garden logs backend` would fetch the logs for the `backend` service, while `garden logs backend,frontend` would fetch the logs for both the `backend` and the `frontend` services.

When using the `kubernetes` or `local-kubernetes` provider, the `garden logs` command is functionally equivalent to `kubectl logs`, but simpler to execute.

## Testing and dependencies

Tests and their dependencies are specified in their modules' `garden.yml` files. Apart from the `name` and `args` (which is the command
to run the tests inside the container), tests may specify runtime dependencies. These can be names of services or tasks. Here's a snippet from our [TLS project](../examples/tls-project.md) example:

```yaml
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - backend
```

Above we're using `npm test` and `npm run integ` for our tests, but they can be anything you'd like. The only constraint is that Garden follows the typical Unix exit codes convention: `0` means success, and any non-zero exit codes represent failure.

Since the `integ` tests depends on `backend`, Garden will ensure that `backend` is deployed before running the `integ` tests. Another use case for test dependencies would be to drop and re-populate a test database before the test run by adding a dependency on a Garden task that does just that.

## Advanced features

For Garden's more advanced features, see the following docs:

- [Hot Reload](./hot-reload.md), for how to automatically update files in a running container without having to restart it and lose state.
- [TLS project](../examples/tls-project.md), for—drumroll!—how to set up TLS with Garden.
- [Remote sources project](../examples/remote-sources.md), for how to integrate multiple remote and local repositories within the same project.
