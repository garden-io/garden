# Tasks example project

This example uses dependency-aware database migrations to demonstrate Garden's _tasks_ functionality.

Tasks are defined under `tasks` in a module's `garden.yml`. They're currently only supported for `container` modules, and consist of a `name`, `args` and `dependencies`.

In short, a task is a _command that is run inside an ad-hoc container instance of the module_.

Tasks may depend on other tasks having been run and/or other services being deployed before they themselves are run (the names of which are listed under the task's `dependencies` field).

## Structure of this project

This project consists of three modules:

- `postgres` — a minimally configured PostgreSQL service with a simple health check
- `hello` — a simple JS/Node service
- `user` — a simple Ruby/Sinatra service

There are two tasks defined in this project:
- `node-migration` (defined in `hello`), which creates a `users` table, and
- `ruby-migration` (defined in `user`), which inserts a few records into the `users` table.

Before `node-migration` can be run, the database has to be up and running, therefore `postgres` is a service dependency of `node-migration`. And before `ruby-migration` can insert records into the `users` table, that table has to exist. `ruby-migration` also requires the database to be up and running, but that's already required by its dependency, `node-migration`, so there's no need for `ruby-migration` to directly depend on `postgres`.

Garden takes care of deploying the project's services and running the project's tasks in the specified dependency order:

When this project is `garden deploy`-ed, `node-migration` is run once `postgres` is up.

Once `node-migration` finishes, `hello` is deployed and `ruby-migration` is run. When ruby-migration finishes, `user` is deployed.

## Usage

The simplest way to see this in action is to run `garden deploy` or `garden dev` in the project's top-level directory.

Run `garden call hello`, and you should see the following output:
```sh
garden call hello
✔ Sending HTTP GET request to http://tasks.local.app.garden/hello

200 OK

Hello from Node! Usernames: John, Paul, George, Ringo
```
