---
order: 1
title: What is Garden
---

**Garden is a DevOps automation tool for developing and testing Kubernetes apps faster**. It ties together all the components of your stack—infrastructure, builds, services, tests—into a **graph** of actions that fully describe how your system is **built**, **deployed**, and **tested**.

This lets you spin up **production-like environments** for development, testing, and CI **on demand**. It also enables teams to use the **same configuration** and workflows for **every stage of software delivery**—and dramatically **speeds up builds and test runs** via smart graph-aware caching.

## Who uses Garden

* **Platform Engineers** use Garden as an integral component of their internal development platform (IDP). Garden allows them to standardize configuration and workflows across teams with heterogeneous tech stacks and to abstract away the gnarly bits so teams can focus on the fun stuff ([learn more here](./use-cases/jumpstart-idp.md)).
* **DevOps Engineers** use Garden to build fast, portable CI pipelines ([learn more here](./use-cases/portable-ci-pipelines.md)).
* **Application Developers** use Garden to develop and test in production-like environments that they can spin up on-demand, without waiting for CI ([learn more here](./use-cases/local-development-remote-clusters.md)).

## How it works

Garden Core is a standalone binary that can run from CI or from a developer’s machine. Its configuration framework allows you to codify a complete description of your stack using intuitive YAML declarations—making your workflows **reproducible and portable**.

It is based on the simple idea that all DevOps workflows can be fully described in terms of the following four actions:

- **build**
- **deploy**
- **test**
- **run** (for running ad-hoc tasks)

…along with the dependencies between these actions across the components of the system.

To make a concrete example, here’s a simplified description of a three tier web application:

```yaml
# This config is in a single file for convenience.
# You can split it into multiple files and even across repositories!
kind: Deploy
name: db
type: helm
spec: # ...
---
kind: Run
name: db-init
type: container
dependencies: [deploy.db]
spec: # ...
---
kind: Build
name: api
type: container
---
kind: Deploy
name: api
type: kubernetes
dependencies: [build.api, run.db-init]
spec: # ...
---
kind: Build
name: web
type: container
---
kind: Deploy
name: web
type: kubernetes
dependencies: [build.web, deploy.api]
spec: # ...
---
kind: Test
name: e2e
type: kubernetes-exec
dependencies: [deploy.api]
spec: # ...
```

Garden collects all of these descriptions, even across multiple repositories, into the Stack Graph—**an executable blueprint for going from zero to a running system in a single command**.

Garden then leverages your existing configuration (Helm charts, Kubernetes manifests, Dockerfiles, Terraform files, etc) and infrastructure to execute the graph **in any environment**.

How these actions (i.e. the graph nodes) are actually run depends on the plugins used (see below).

### The Garden CLI

Each of the four actions (build, deploy, test, run) has a corresponding command that you can run with the Garden CLI.

For example, to create a preview environment on every pull request, simply add the following to your CI pipeline:

```yaml
garden deploy --env preview
```

Or say a developer wants to run an end-to-end test from their laptop as they code. Again, it’s simple:

```yaml
garden test --name e2e
```

Garden also has a special mode called "sync mode" which live reloads changes to your running deploys ensuring **blazing fast feedback while developing**. To enable it, simply run:

```yaml
garden deploy --sync
```

There are also a handful of utility commands for getting logs, exec-ing into services, publishing images, and more.

Thanks to the Stack Graph, these workflows stay consistent no matter how big your stack grows.

### Caching

One of the most important features of Garden is its smart caching abilities. Thanks to the graph structure, Garden can calculate the version of any part of your system, while accounting for upstream dependencies.

**This ensures that the same image never needs to be built twice or the same test run twice.**

If the end-to-end test in the example above passes, Garden will know not to run it again if the code hasn’t changed. Since Garden factors in dependencies, it will however re-run the test if any of the upstream services under test are modified.

Most tools don’t have this granular understanding of the system and the choice is between running everything or nothing. With Garden you can be confident that tests run when they **need to,** but no more.

This alone can speed up your pipelines by orders of magnitude.

### Templating

Garden has a powerful templating engine that allows you to set variables and enable or disable parts of the graph depending on your environment.

You might for e.g. deploy a development database with the Kubernetes plugin in development but use the Terraform plugin to provision a managed database for production.

This allows you to codify your entire stack and use the same workflows for all stages of software delivery.

