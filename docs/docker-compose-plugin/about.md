---
order: 1
title: About
---

# About

{% hint style="warning" %}
The Docker Compose plugin is still experimental. Please let us know if you have any questions or if any issues come up!
{% endhint %}

This plugin allows you to integrate [Docker Compose](https://docs.docker.com/compose/) projects into your Garden project.

It works by parsing the Docker Compose projects, and creating Build and Deploy actions for each [service](https://docs.docker.com/compose/compose-file/05-services/) in the project.

You can then easily add Run and Test actions to complement your Compose project.

This can be very useful e.g. for running tests against a Docker Compose stack in CI (and locally), and to wrap various scripts you use during development (e.g. a Run for seeding a database with test data, or a Run for generating a database migration inside a container that you're developing).

The provided action types are (links point to the corresponding reference docs):
* `docker-compose-service` ([Build](../reference/action-types/Build/docker-compose-service.md) and [Deploy](../reference/action-types/Deploy/docker-compose-service.md)): These wrap the build and deploy (service) steps defined in a Compose project.
  * The `docker-compose-service` Build action calls `docker compose build <service-name>` under the hood.
  * The `docker-compose-service` Deploy action calls `docker compose up <service-name>` under the hood.
* `docker-compose-exec` ([Run](../reference/action-types/Run/docker-compose-exec.md) and [Test](../reference/action-types/Test/docker-compose-exec.md)): These use `docker compose exec` to execute the specified command in an already running Docker Compose service.
* `docker-compose-run` ([Run](../reference/action-types/Run/docker-compose-run.md) and [Test](../reference/action-types/Test/docker-compose-run.md)): These use `docker compose run` to run the specified command in a new container based on the Docker Compose service.
* `docker-run` ([Run](../reference/action-types/Run/docker-run.md) and [Test](../reference/action-types/Test/docker-run.md)): Like `docker-compose-run`, but these are independent of the Docker Compose project, and simply reference a Docker image tag to run (uses `docker run` under the hood).

## Getting started

First, add the `docker-compose` provider to your Garden project configuration. Here's a minimal example:
```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
environments:
- name: local
providers:
- name: docker-compose
  environments: [local]
```

{% hint style="info" %}
Note that you can easily combine the `docker-compose` provider with the `local-kubernetes` and `kubernetes` providers: A typical use-case would be to use Docker Compose for local development, and then the Kubernetes-based plugins in CI (or when you want to reproduce & debug failing tests in CI from your dev machine without re-running the pipeline).

Your Docker Compose actions can live side by side with your Kubernetes-based actions.
{% endhint %}

That's all you need to build and deploy your existing Compose project with Garden! Just run `garden deploy` to deploy your project, `garden logs -f` to tail the logs etc.

## Extending your Docker Compose project with tests and scripts

In vanilla Compose, you might set up a dummy service to wrap a script:
```yaml
  # From https://github.com/garden-io/garden/blob/main/examples/docker-compose/docker-compose.yml
  ...
  # this service runs once to seed the database with votes
  # it won't run unless you specify the "seed" profile
  # docker compose --profile seed up -d
  seed:
    build: ./seed-data
    profiles: ["seed"]
    depends_on:
      vote:
        condition: service_healthy 
    networks:
      - front-tier
    restart: "no"
```
You could do the same for tests (set them up as services and run them as one-off containers using special profiles).

While this works, it's a bit clunky—we're making use of the service primitive to run scripts and tests, which isn't what it was really designed for (building and running a service).

Fortunately, Garden's Run and Test actions are a more natural fit for this. This makes Garden's Docker Compose plugin the perfect extension to Docker Compose. This is how we'd seed the DB with a Run:
```yaml
# From https://github.com/garden-io/garden/blob/main/examples/docker-compose/project.garden.yml
kind: Run
type: docker-run
name: seed-votes
description: |
  Seed Postgres with some test data. We don't use the seed service in the compose project here, but reference
  an image from a `container` Build instead.
dependencies: [deploy.vote-compose]
spec:
  projectName: ${var.projectName}
  image: ${actions.build.seed-votes.outputs.deployment-image-id}
  networks: ["front-tier"]
```
Instead of `docker compose --profile seed up -d`, we can now just run `garden run seed-votes`.

Tests are very similar:
```yaml
# From https://github.com/garden-io/garden/blob/main/examples/docker-compose/project.garden.yml
kind: Test
type: docker-run
name: vote-integ
dependencies: [deploy.vote-compose]
spec:
  # The build action here is located in ./result/tests/build.garden.yml
  projectName: ${var.projectName}
  image: ${actions.build.vote-tests.outputs.deployment-image-id}
  networks: [front-tier]
```
and are run via `garden test`.


You can also take advantage of Garden's variables and templating to provide environment variable overrides to the actions you define, and more. See the reference docs for the full set of config fields available (links for each action type provided by this plugin can be found in the [About](#about) section above).

## Bringing together several Docker Compose projects

This is an advanced use-case supported by the plugin. Using the [`projects`](../reference/providers/docker-compose.md#providersprojects) field on the `docker-compose` provider, you can specify several projects to be included in the Garden project (by default, Garden looks for a Docker Compose project in the same directory as the Garden project configuration).

This can be useful e.g. for end-to-end testing in CI where you want to tie together several Docker Compose projects for a more complete stack.

## Next steps

The simplest way to take this plugin for a spin is to try the [`docker-compose` example project](../../examples/docker-compose), where you can see most of the action types and features of the plugin in action.

If you're having issues with Docker Compose itself, please refer to the [official docs](https://docs.docker.com/compose/).
