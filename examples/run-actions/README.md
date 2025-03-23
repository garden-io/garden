# `Run` actions example project

This example uses dependency-aware database migrations to demonstrate Garden's `Run` action functionality.

`Run` actions are defined as separate sections in a module's `garden.yml`. They're currently only supported for `type: container`.

In short, a `Run` action is a _command that is run inside an ad-hoc container instance_. The container can be specified either as a `build` reference to an image in the same Garden project, or as a `spec.image` referring to an arbitrary container image string.

`Run` actions may depend on other actions having been run, built or deployed before they themselves are run. These can be specified under the `dependencies` field.

## Structure of this project

This project consists of three parts:

- [postgres](postgres/garden.yml) — a minimally configured PostgreSQL service with a simple health check
- [hello](hello/garden.yml) — a simple JS/Node service
- [user](user/garden.yml) — a simple Ruby/Sinatra service

There are two `Run` actions defined in this project:

- `node-migration` (defined in [hello/garden.yml](hello/garden.yml)), which creates a `users` table, and
- `ruby-migration` (defined in [user/garden.yml](user/garden.yml)), which inserts a few records into the `users` table.

Before `node-migration` can be run, the database has to be up and running, therefore `deploy.postgres` is a dependency of `node-migration`. And before `ruby-migration` can insert records into the `users` table, that table has to exist. `ruby-migration` also requires the database to be up and running, but that's already required by its dependency, `run.node-migration`, so there's no need for `ruby-migration` to directly depend on `deploy.postgres`.

Garden takes care of deploying the project's services and running the project's tasks in the specified dependency order:

When this project is `garden deploy`-ed, `node-migration` is run once `postgres` is up.

Once `node-migration` finishes, `hello` is deployed and `ruby-migration` is run. When ruby-migration finishes, `user` is deployed.

## Usage

The simplest way to see this in action is to run `garden deploy` or `garden dev` in the project directory.
