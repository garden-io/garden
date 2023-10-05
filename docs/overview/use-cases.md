---
order: 4
title: Use Cases
---

At its core, Garden is a _cache-aware, graph execution engine_—we know, that’s a mouthful!

As such, it’s quite flexible and you can basically use it to execute any sort of workflow in dependency order.

However, it’s purposefully built to speed-up and simplify cloud native development for teams building distributed systems that run on Kubernetes. Below we’ll look at how these teams actually use Garden in the real world to improve their overall delivery process.

The common thread in the use cases below are that the projects in question are distributed systems that contain anywhere from a handful of services to a several hundred. Most of them are containerised and run on Kubernetes.

In what follows we assume you have a basic understanding of how Garden works. If not, we recommend you check out the [“How Garden Works”](./how-garden-works.md) page of our docs first.

## Faster, simpler, and portable CI

This is the starting point for most teams and in fact all of the use cases below build on this one.

Teams use Garden in CI to make their pipelines faster, reduce the number of lines of config, and ensure CI workflows are portable and debuggable.

These teams typically use Garden to run their tests and create preview environments in Kubernetes clusters that run outside of the CI environment, ensuring the testing and preview environments are “production-like”.

Faster, simper, and more portable is a big statement—below we’ll explain how.

### CI is faster because…

Garden knows exactly what files go into which action of the [Stack Graph](./how-garden-works.md#the-stack-graph). For teams that have an end-to-end test that depends on, say, their API and Web servers, and the files belonging to those actions haven’t changed for a given PR, Garden simply skips running that end-to-end test.

Similarly, when developers run the test from their laptop against same environment as the CI pipeline uses, Garden will also skip running it in CI. Since the test runs in a remote environment and Garden knows the version of every single file, they can trust that the test does indeed pass. No need to run it again.

The larger the graph, the more time savings you get. Some of our users have reduced CI pipeline run times from an hour to minutes.

If you find yourself waiting for an entire CI pipeline to re-run just because you updated a commit message, Garden might be the tool for you. In that specific case, the pipeline run is essentially a no-op and only takes seconds to complete.

### CI is simpler because…

Team’s use Garden configuration to “model” their stack such that they can deploy it or test it from anywhere with the Garden CLI. Here’s a simple example (with some config omitted for conciseness):

```yaml
kind: Project
name: my-garden-project
providers: [kubernetes]
# ...
---
kind: Build
type: container
name: api-image
# ...
---
kind: Deploy
type: kubernetes
name: api
spec:
  files: [./api-manifests.yaml]
# ...
---
kind: Test
type: kubernetes
name: e2e
dependencies: [deploy.api]
```

With this config, Garden can deploy the project with the `garden deploy` command and test it with the `garden test`—either from a user’s laptop or from a CI runner.

It follows that team’s using Garden can reduce a lot of their CI config down to single line jobs, say: `garden deploy` or `garden test`.

We’ve seen complex pipelines with thousands of lines of YAML boil down to these simple commands.

If you find yourself duplicating a lot of config between CI and other environments and trying to tie it all together with bash, Garden might help simplify things. It gives you a tool to codify your workflows once, and run them in any environment.

### CI is portable because…

When teams adopt Garden, they start by codifying their stack and workflows with Garden config, similar to the example in the section above.

In particular they specify the environments that belong to their project. A common example would be `dev`, `ci`, and `preview`.

Once the config takes shape, they’re able to deploy the entire stack from their laptops with commands like `garden deploy`.

By specifying different environment variables for different environments, they can “port” this workflow to CI, and use it to e.g. create a preview environment on every pull request with a one-liner CI job that runs `garden deploy --env preview`.

It’s also common for teams to toggle parts of their stack by environment. For example, they will deploy an ephemeral database into a Kubernetes namespace for development with Garden’s Helm plugin but use Garden’s Terraform or Pulumi plugins to provision a cloud database for a `preview` environment.

Either way, the config and Stack Graph looks much the same and a DevOps engineer or developer can easily author and debug CI pipelines by running the same commands from their laptop. This is what we mean when we say your CI pipelines are portable—you can run them from anywhere!

(Not to get too pedantic, but you could also say your dev environments are portable. In any case, Garden removes the chasm between your environments and we typically find users start from the “right side and then shift left”.)

Our commercial offering, Garden Enterprise, also includes secrets management and RBAC to ensure you don’t need to add any secrets to your CI provider to ensure 100% portability.

For more details check out our guide on [using Garden in CI](../guides/using-garden-in-ci.md).

## On-demand preview environments

Teams often use Garden to spin up isolated preview environments.

A common use case is to add a CI job that runs a command like `garden deploy --env preview` to ensure a fresh preview environment for each PR.

These teams use Garden’s templating syntax to ensure the environment is unique and isolated, e.g. by including the PR number in namespace and hostnames (you can learn more about isolating environments in [this guide](../guides/namespaces.md))

As we mentioned in the previous section, these workflows are portable so it’s also common for developers to spin them up *as they code* with the same command. For example to share work in progress with stakeholders or poke around in a production-like environment.

Our commercial offering, Garden Enterprise, allows you to automatically cleanup the environments Garden creates after a certain period to save costs on remote environments.

## End-to-end testing

Garden allows you spin up remote production like environments in a single command from anywhere.

Having access to one is usually a prerequisite for running end-to-end tests. (As the name suggests, you need your project running from end-to-end to do that).

Furthermore, Garden treats testing as a first class citizen and the `Test` action is one of its four core actions (the others being `Build`,  `Deploy` and `Run` for ad-hoc tasks like DB migrations).

This is often why teams choose Garden—to enable them to write end-to-end tests to begin with. Before, the process was simply too arduous and tests too hard to maintain.

As with the other use cases, teams can run their tests in a single command and from anywhere. Specifically, developers can run them as they develop to make it easier to write, maintain, and debug end-to-end tests.

If you find yourself:

- waiting for CI to see if a test passes,
- then making a best guess effort at fixing it locally when it doesn’t,
- then waiting for CI some more,
- then rinse and repeat

…this use case might be for you.

Smart caching will also help speed up pipelines for projects with a lot of tests. In fact, one the teams using Garden is able to end-to-end test a stack of 130+ services, hundreds of times a day, thanks to Garden’s caching.

## Production-like developer environments

There comes a time when your project simply gets too large to run on your laptop, and you need the full power of the cloud to fully spin it up.

A lot of our users come to us with just that problem. Often they’re using Docker Compose and their laptops can’t run the entire stack anymore. At the same time their project runs comfortably in the cloud in “higher” environments like staging and production.

Typically these teams already have Dockerfiles, K8s manifests / Helm charts, and the know-how to operate clusters, and want to empower their developers with the same.

Garden gives them the automation to shift these workflows left, without introducing friction or cognitive overload to developers.

Developers start their day by running `garden dev` and deploy their project into an isolated namespace in a Kubernetes development cluster, re-using existing config and manifests but overwriting values as needed with Garden’s template syntax.

Teams then use Garden’s sync functionality to live reload changes into running Pods in the remote cluster, without needing a full re-build or re-deploy on every code change. There’s typically a trade of between how realistic your environment is and the speed of the feedback but with Garden you can get both.

And as with the other use cases, Garden’s caching ensures dev environments are spun up fast.

If you worry your laptop may catch fire next time you run `docker compose up`, remote environments might be for you.

## Hybrid environments

This is a spin on the section above.

Not everyone needs *everything* running remotely *all the time*.

That’s why another common application of remote development environments is to use them to deploy a subset of the stack, e.g. a set of backend services that don’t change often, and run the rest locally.

Garden is pluggable and Kubernetes is just one of its plugins—it can also manage local processes with the `exec` plugin.

A common use case is to e.g. deploy API servers to a remote environment and start the frontend locally, all in a single command.

## Eliminate drift and simplify tool chain

Even if teams are using Kubernetes, there’s often more to the story.

Some services may still run in legacy environments, IAC tools like Terraform and Pulumi are used to provision infrastructure, static assets are served from an edge compute provider, and there’s always a handful of scripts that need to run to get set up.

In short, there’s more to it than running `kubectl apply`.

Because Garden is pluggable with plugins for Terraform, Pulumi, local scripts, and more, another common use case is for teams to use it to reign in the sprawling complexity of their stack.

All of these tools and bash scripts can be incorporated into the [Garden Stack Graph](../overview/how-garden-works.md#the-stack-graph). Furthermore, Garden supports “action templates” which allows DevOps engineers or Platform Teams to author and maintain templates that other teams across the organisation can consume, without introducing more tooling and config drift.

One of our users told us that any developer can hop over to any team and be productive in a day, even if that team has a vastly different stack. It’s still just `garden dev` and `garden test`.

Another team using Garden cut onboarding time from sevens days to fours hours by allowing developers to spin up remote dev environments in a single command, without needing to install any local dependencies. You can read about it in [this case study](https://garden.io/blog/kubernetes-automation).

If config drift keeps you up at night, or if your developers find themselves digging through stale docs, spread across multiple repos, just to be able to start their development environment, Garden might help.

To learn more, check out [this blogpost](https://garden.io/blog/garden-linkerd) on using Garden and Linkerd to create the *perfect* internal development platform.
