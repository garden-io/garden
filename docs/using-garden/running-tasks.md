---
order: 6
title: Running Tasks
---

# Running Tasks

You add tasks when you want Garden to execute specific commands before deploying a service or running a test. At its most basic, the configuration looks like this:

    # garden.yml
    kind: Module
    tasks:
      - name: db-init
        args: [rake, db:migrate]
      - name: db-clear
        args: [rake, db:rollback]

> Note that not all [modules types](../module-types/README.md) support tasks.

## How it Works

Tasks belong to modules and each module can have several tasks. A common use case for a task is a database migration.

Tasks that have _dependents_ (i.e. something that depends on them) are run automatically by Garden. For example, if a service depends on a task being run before it is deployed, then Garden will automatically run that task before deploying the service. Other tasks will need to be run manually.

Garden caches task results and re-runs the task if its dependencies, have changed. It is therefore recommended that you make sure your tasks are idempotent (i.e. can safely be run multiple times).

Garden does **not re-run tasks** on changes when in watch mode. That is, when running Garden with the `--watch|-w` flag or when running `garden dev`.

You can run a task manually with the `garden run task <task-name>` command. This will run the task regardless of whether or not the result is cached.

You can view task results from the dashboard or by running `garden get task-result <task-name>`.

Task names must currently be unique across your project.

## Tasks in the Stack Graph

Tasks correspond to a **run** action in the Stack Graph.

- Tasks can depend on other tasks and services.
- Tasks implicitly depend on their parent module's build task.
- Services and tests can depend on tasks.

## Examples

### Database Migration

Below is an example of a Helm module that uses the `postgresql` Helm chart. The module has a task for initializing the database and another one for clearing it. In the example we use environment variables to set the password. Notice also that the tasks depend on the `postgres` service being deployed.

```yaml
kind: Module
type: helm
chart: stable/postgresql
...
tasks:
  - name: db-init
    command: [/bin/sh, -c]
    args: [
      psql,
      -w,
      -U, postgres,
      --host, postgres,
      --port, 5432,
      -d, postgres,
      -c "CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)"
    ]
    env:
      PGPASSWORD: postgres
    dependencies:
      - postgres
  - name: db-clear
    args: [
      psql,
      -w,
      -U, postgres,
      --host, postgres,
      --port=5432,
      -d, postgres,
      -c, "TRUNCATE votes"
    ]
    env:
      PGPASSWORD: postgres
    dependencies:
      - postgres
```

The full example is [available here](https://github.com/garden-io/garden/blob/v0.10.11/examples/vote-helm/postgres/garden.yml). There's [also a version](https://github.com/garden-io/garden/tree/v0.11.5/examples/vote) that uses the `container` module type instead of Helm charts.

## Advanced

### Task Artifacts

Many module types, including `container`, `exec` and `helm`, allow you to extract artifacts after tasks have been run. This can be handy when you'd like to view reports or logs, or if you'd like a script (via a local `exec` module, for instance) to validate the output from a task.

By convention, artifacts you'd like to copy can be specified using the `artifacts` field on task configurations. For example, for the `container` module, you can do something like this:

```yaml
kind: Module
type: container
name: my-container
...
tasks:
  - name: my-task
    command: [some, command]
    artifacts:
      - source: /report/*
        target: my-task-report
```

After running `my-task`, you can find the contents of the `report` directory in the task's container, locally under `.garden/artifacts/my-task-report`.

Please look at individual [module type references](../module-types/README.md) to see how to configure each module type's tasks to extract artifacts after running them.

### Disabling Tasks

Module types that allow you to configure tasks generally also allow you to disable tasks by setting `disabled: true` in the task configuration. You can also disable them conditionally using template strings. For example, to disable a `container` module task for a specific environment, you could do something like this:

```yaml
kind: Module
type: container
...
tasks:
  - name: database-reset
    disabled: ${environment.name == "prod"}
    ...
```

Tasks are also implicitly disabled when the parent module is disabled.

### Kubernetes Provider

The Kubernetes providers execute each task in its own Pod inside the project namespace. The Pod is removed once the task has finished running.

Task results are stored as [ConfigMaps](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/) in the `<project-name--metadata>` namespace with the format `task-result--<hash>`.

To clear cached task results, you currently have to delete the ConfigMaps manually with kubectl. Here's an example of how that's done:

```console
kubectl delete -n <project-name>--metadata $(kubectl get configmap -n <project-name>--metadata -o name | grep task-result)
```

### Exec Modules

The `exec` module type runs tasks locally in your shell. By default, the `exec` module type executes tasks in the Garden build directory (under `.garden/build/<module-name>`). By setting `local: true`, the tasks are executed in the module
source directory instead.

## Further Reading

* For full task configuration by module type, please take a look at our [reference docs](../module-types/README.md).

## Next Steps

Take a look at our [Guides section](../guides/README.md) for more of an in-depth discussion on Garden concepts and capabilities.
