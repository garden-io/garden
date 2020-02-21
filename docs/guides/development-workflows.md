# Development Workflows

Now that you've had a glimpse of the basic Garden commands in the [Quick Start](../basics/quick-start.md) guide, and
learned about the [Stack Graph](../basics/stack-graph.md), let's go through some typical Garden workflows.

We'll keep using the [Demo Project](../examples/demo-project.md) example, but the same principles will apply for most
Garden projects.

## garden dev

If you have a reasonably simple project and fairly fast test suites, you may want to simply keep `garden dev` running
while you work.

When you start it, `garden dev` will start your development environment and run all your tests, and then wait for code
changes. When you then make changes, Garden re-builds, re-deploys, and re-tests the modules/services that are affected,
based on the dependency graph.

For example, if we run `garden dev` inside the [Demo Project](../examples/demo-project.md), the output should be
something like this:

```plain
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

```plain
✔ frontend              → Building frontend:v-9cfd748cd2-1553707229... → Done (took 1.4 sec)
✔ frontend              → Deploying version v-9cfd748cd2-1553707229... → Done (took 8 sec)
    ℹ frontend              → Service deployed
    → Ingress: http://demo-project.local.app.garden/hello-frontend
    → Ingress: http://demo-project.local.app.garden/call-backend
✔ frontend              → Running unit tests → Success (took 3.5 sec)
✔ frontend              → Running integ tests → Success (took 4.4 sec)

🌻  Garden dashboard and API server running on http://localhost:59636
🕑  Waiting for code changes
```

As we can see, `frontend` was rebuilt, redeployed, and its unit & integration tests re-run.

To further explore the relationship between all the modules, services, tests and tasks, you can follow the link to
the dashboard and browse around. You can also use that to look at service logs, test results and more.

## Just the builds/deploys/tests please

Sometimes though, you might prefer to skip the testing step. Perhaps your tests take a while to run (which is of course
common with distributed systems), or you simply don't need to run them on every code change.

For this you can simply use `garden deploy --watch`. This will watch for changes, then build and deploy them, but it'll
skip testing.

In fact, all of `garden build`, `garden deploy` and `garden test` have optional `-w/--watch` flags, and allow
you to filter down to just the modules, services or tests you're working on at that time.

In many cases you don't even want to watch continuously for changes. In that case, simply use one of the above commands
without the `-w/--watch` flag.

## Hot reloading

For rapid iteration on a running service, you can use an advanced feature called _hot reloading_.
See the [Hot reload guide](./hot-reload.md) for details on how to configure and use that feature.

## Logs

While developing, it's often useful to have a stream of logs from your services handy. As mentioned above, you can
navigate to those in the dashboard, but it can also be handy to have them continuously streaming to your console.

For that you can use the `garden logs` command, followed by the name of the service you'd like to query. For example `garden logs backend` would fetch the logs for the `backend` service, while `garden logs backend,frontend` would fetch the logs for both the `backend` and the `frontend` services. Or just run `garden logs -f` to stream (`-f` for "follow") all service logs while you work.

When using the `kubernetes` or `local-kubernetes` provider, the `garden logs` command is functionally equivalent to
using [stern](https://github.com/wercker/stern). Behind the scenes it simply uses Kubernetes logging facilities and
wraps them for you.

## Tests and dependencies

Tests and their dependencies are specified in their modules' `garden.yml` files. Apart from the `name` and `args` (which is the command
to run the tests inside the container), tests may specify _runtime_ dependencies. These can be names of services or tasks.

Here's a snippet from the config for the `frontend` service in our demo project:

```yaml
# frontend/garden.yml
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - frontend
```

Garden doesn't mind what happens inside each of those test suites. It just makes sure the module is built and up-to-date
when they run, and if they declare `dependencies`, Garden will make sure those dependencies are up-to-date before
running or re-running the tests.

Case in point, we're using `npm test` and `npm run integ` for our tests in the example, but those commands could be
anything relevant for your module. The only constraint is that Garden follows the typical Unix exit codes convention:
`0` means success, and any non-zero exit codes represent failure.

Garden also caches test results, based on the hash of the module source files, and (if applicable) all connected build
and runtime dependencies. That way, Garden knows which tests to run when any source file is modified.

In this example, since the `integ` tests depends on the `frontend` which has a transitive dependency on the `backend`,
Garden will ensure that both the `frontend` and `backend` are deployed with the latest code before running the `integ` tests.
The `unit` test only requires a build of the `frontend` which is an implicit dependency for all tests in the module.

## Next steps

We recommend diving into our [configuration files guide](./configuration-files.md) next, to learn more about how to
set up a project with Garden.
