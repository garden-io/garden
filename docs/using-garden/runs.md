---
order: 6
title: Runs
---

# Runs

You add Runs when you want Garden to execute specific commands before executing an different Action. At its most basic, the configuration looks like this:

```yaml
# garden.yml
kind: Run
name: db-migrate
type: container
build: backend
spec:
  command: ["rake", "db:migrate"]
```

Runs that have _dependents_ (i.e. something that depends on them) are run automatically by Garden. For example, if a Deploy depends on a Run, then Garden will automatically run that Run before executing the Deploy. Other Runs will need to be run manually.

Garden caches Run results and re-runs the Runs if its dependencies have changed. It is therefore recommended that you make sure your Runs are idempotent (i.e. can safely be run multiple times). This behaviour can be disabled via the `spec.cacheResult` field on Runs.

You can run a Run manually with the `garden run <run-name>` command. This will run the Run regardless of whether or not the result is cached.

You can view task results by running `garden get run-result <run-name>`.

## Examples

### Database Migration

Below is an example of two Runs for a Deploy that uses the `postgresql` Helm chart. The `db-init` Run is for initializing the database and `db-clear` is for clearing it. Notice how the Runs depend on `deploy.db`. These Runs are of type [`kubernetes-exec`](../reference/action-types/Run/kubernetes-exec.md) that's used for running commands directly in a running Deploy.

```yaml
kind: Run
name: db-init
type: kubernetes-exec
dependencies: [deploy.db]
spec:
  resource:
    kind: "StatefulSet"
    name: "postgres"
  command: [
      "/bin/sh",
      "-c",
      "sleep 15 && PGPASSWORD=postgres psql -w -U postgres --host=postgres --port=5432 -d postgres -c 'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)'",
    ]

---
kind: Run
name: db-clear
type: kubernetes-exec
dependencies: [deploy.db]
spec:
  resource:
    kind: "StatefulSet"
    name: "postgres"
  command:
    [
      "/bin/sh",
      "-c",
      "PGPASSWORD=postgres psql -w -U postgres --host postgres --port=5432 -d postgres -c 'TRUNCATE votes'",
    ]
```

The full example is [available here](../../examples/vote-helm/postgres/garden.yml). There's [also a version](../../examples/vote/README.md) that uses the `container` action type instead of Helm charts.

## Advanced

### Run Artifacts

Many action types, including `container`, `exec` and `helm`, allow you to extract artifacts after Runs have completed. This can be handy when you'd like to view reports or logs, or if you'd like a script (via a local `exec` action, for instance) to validate the output from a Run.

Desired artifacts can be specified using the `spec.artifacts` field on Run configurations. For example, for the `container` Run, you can do something like this:

```yaml
kind: Run
type: container
name: my-run
...
spec:
  command: [some, command]
  artifacts:
    - source: /report/*
      target: my-run-report
```

After running `my-run`, you can find the contents of the `report` directory in the runs's container, locally under `.garden/artifacts/my-run-report`.

Please look at individual [action type references](../reference/action-types/README.md) to see how to configure each Run to extract artifacts.

### Runs with arguments from the CLI

For Runs that are often run ad-hoc from the CLI, you can use variables and the `--var` CLI flag to pass in values to the Run.
Here for example, we have a simple container Run that can receive an argument via a variable:

```yaml
kind: Run
type: container
name: my-run
...
spec:
  command: ["echo", "${var.my-run-arg || ''}"]
```

You can run this Run and override the argument variable like this:

```sh
garden run my-run --var my-run-arg="hello!"
```

## Further Reading

For the full configuration possibilities please take a look at our [reference docs](../reference/module-types/README.md).

## Next Steps

Take a look at our [Workflows section](./workflows.md) to learn how to define sequences of Garden commands and custom scripts.
