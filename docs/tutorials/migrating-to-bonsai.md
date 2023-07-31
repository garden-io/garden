# Migrating your configuration for Bonsai

**Bonsai** is the codename for Garden 0.13.

In Garden Bonsai, _actions_ replace _modules_ as the recommended way to describe components in your your Garden projects. The top-level project configuration is mostly unchanged.

But fear not: Bonsai is _mostly backwards compatible_ with the old configuration! There are very few breaking changes that require editing any existing module-based configuration files - your projects should mostly just work when updating Garden.

On the other hand, the new configuration format is easier to read and write, provides much more flexibility, and adds some completely new functionality. We encourage you to incrementally convert your module configs to actions when you feel the time is right in your project.

If you'd like to learn more about actions before proceeding, check out the [actions guide](../using-garden/) (which describes actions in depth).

## Breaking changes first

Here is the list of breaking changes from Garden Acorn (0.12) to Bonsai (0.13). This lets you use your old module configs with minimal changes.

- The `cert-manager` integration has been removed. New documentation has been created in the [ext dns and cert manager example](../../examples/cert-manager-ext-dns)
- `dev-mode` has been renamed to `sync` (and is now referred to as sync mode), both in configuration as well as in CLI command options.
- The `garden delete` command has been renamed to `garden cleanup`.
- `garden delete env` has been renamed to `garden cleanup namespace`, with an alias of `garden cleanup ns`
- Changes to the caching behaviour:
  - Now Garden caches Run results and re-runs the Runs if its dependencies have changed. It is therefore recommended that you make sure your Runs are idempotent (i.e. can safely be run multiple times). This behaviour can be disabled via the `spec.cacheResult` field on Runs.
- Changes to project configuration:
  - The `dotIgnoreFiles` field has been renamed to `dotIgnoreFile` and only supports one file. The old `dotIgnoreFiles` field is still supported with a deprecation warning. Now it supports only 1 filename defined in the array, otherwise an error will be thrown.
  - The `modules.*` field has been renamed to `scan.*`. The old syntax is still supported with a deprecation warning.
  - Removed default `environments` (this might require you to explicitly specify a plugin name or two in your project config that were previously inferred implicitly).
- The deprecated `hot-reload` mode has been removed: Use `sync` instead.
  - Sync mode is faster, more reliable and more full-featured than the old hot reload mode, so we feel confident that you'll be happy with the upgrade.
- The deprecated `cluster-docker` build mode has been removed. Please use `cluster-buildkit` or `kaniko` instead.
- Dropped support for deploying an in-cluster registry
  - See the [in-cluster build documentation](../k8s-plugins/remote-k8s/configure-registry/README.md) for guidance on how to set up a container registry for using Garden with a remote Kubernetes cluster.
- Dropped support for the following providers:
  - `google-app-engine`
  - `google-cloud-functions`
  - `local-google-cloud-functions`
  - `maven-container` (superseded by the `jib-container` plugin)
  - `npm-package` (the `exec` provider is a good replacement there)
  - `openfaas`

## Note before continuing

It is possible to use both module and action configs in the same project. This should make it easier to convert projects piece by piece.

Internally, Garden converts modules into actions:

- The build step of a module (if any) becomes a Build action.
- Services become Deploy actions.
- Tests become Test actions.
- Tasks become Run actions.

This means that converting your project to the actions config can be performed gradually by starting from the end of the dependency tree.

The general flow of the Garden runtime is as follows:

- Modules are resolved
- Modules are converted to actions
- Actions are resolved

However, there are some caveats:

- Modules cannot depend on actions
- Modules cannot reference actions
- Actions can reference and depend on modules, by referencing the actions that are generated from modules.

## Updating the CLI

If you have installed `garden` via Homebrew, running `brew upgrade garden-cli` will update you to Bonsai (0.13.x).

Alternatively, you can use the built-in update mechanism to update in-place: `garden self-update --major`. You can run `garden self-update --help` for more details.

Lastly, you can manually download any version on our [releases page](https://github.com/garden-io/garden/releases).

## Opt in to the new format

Here are a couple of examples of converting module configs to action configs.

The added granularity and flexibility should make it easier to configure complex projects, and significantly reduce the number of unnecessary rebuilds.

This is a short tutorial, you can find the full reference documentation for Actions [here](../reference/action-types/README.md)

### vote/api

<div style="columns: 2">

```yaml
# Before: one YAML document

# The top-level Module config is changed a bit
kind: Module
type: container
name: api
description: The backend for the voting UI

# The services section is converted into a Deploy action
services:
  - name: api
    args: [python, app.py]
    ports:
      - name: http
        protocol: TCP
        containerPort: 80
    healthCheck:
      httpGet:
        path: /api
        port: http
    ingresses:
      - path: /
        hostname: "api.${var.baseHostname}"
        port: http
    dependencies:
      - redis

# The tests are converted into Test actions
tests:
  - name: unit
    args: [echo, ok]
  - name: integ
    args: [python, /app/test.py]
    timeout: 200
    dependencies:
      - api
```

```yaml
# After: sections with YAML document separators ---

# Now we have a more explicit Build action
kind: Build
type: container
name: api
description: The backend container for the voting UI

---
# The Deploy action has some top-level settings
kind: Deploy
type: container
name: api
description: The backend deployment for the voting UI
# Uses the container created by the Build action above
build: api
# Dependencies has been moved from the services to here,
# and they can now be much more granular:
# refer to specific Build, Deploy, Run, and Test actions
dependencies: [deploy.redis]

# But most of the previous service can be pasted under spec
spec:
  args: [python, app.py]
  ports:
    - name: http
      protocol: TCP
      containerPort: 80
  healthCheck:
    httpGet:
      path: /api
      port: http
  ingresses:
    - path: /
      hostname: "api.${var.baseHostname}"
      port: http

---
kind: Test
type: container
name: api-unit
build: api
spec:
  args: [echo, ok]

---
kind: Test
type: container
name: api-integ
build: api
dependencies: [deploy.api]
timeout: 200
spec:
  args: [python, /app/test.py]
```

</div>

### vote/postgres

<div style="columns: 2">

```yaml
kind: Module
type: container
name: postgres
description: Postgres container for storing voting results
image: postgres:12

# Module services -> Deploy spec
services:
  - name: db
    volumes:
      - name: data
        containerPath: /db-data
    ports:
      - name: db
        containerPort: 5432
    env:
      POSTGRES_DATABASE: ${var.postgres-database}
      POSTGRES_USERNAME: ${var.postgres-username}
      POSTGRES_PASSWORD: ${var.postgres-password}
    healthCheck:
      command: [psql, -w, -U, "${var.postgres-username}", -d, "${var.postgres-database}", -c, "SELECT 1"]

# Module tasks -> separate dedicated Run actions
tasks:
  - name: db-init
    command: [/bin/sh, -c]
    args:
      [
        "sleep 15 && psql -w --host=db --port=5432 -d $PGDATABASE -c 'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)'",
      ]
    dependencies: [db]
    env: &env
      PGDATABASE: ${var.postgres-database}
      PGUSER: ${var.postgres-username}
      PGPASSWORD: ${var.postgres-password}
  - name: db-clear
    command: [/bin/sh, -c]
    args: ["psql -w --host=db --port=5432 -d $PGDATABASE -c 'TRUNCATE votes'"]
    dependencies: [db]
    env:
      <<: *env
```

```yaml
kind: Deploy
type: container
name: db
description: Postgres container for storing voting results

# Module services -> Deploy spec
spec:
  # When specifying an image instead of a Build,
  # do so in the spec section
  image: postgres:12
  volumes:
    - name: data
      containerPath: /db-data
  ports:
    - name: db
      containerPort: 5432
  env:
    POSTGRES_DATABASE: ${var.postgres-database}
    POSTGRES_USERNAME: ${var.postgres-username}
    POSTGRES_PASSWORD: ${var.postgres-password}
  healthCheck:
    command: [psql, -w, -U, "${var.postgres-username}", -d, "${var.postgres-database}", -c, "SELECT 1"]

# Dedicated Run actions - note that these can now be depended on
# in any other configuration, as run.db-init and run.db-clear

---
kind: Run
type: container
name: db-init
dependencies: [deploy.db]
spec:
  image: postgres:12
  command:
    [
      "/bin/sh",
      "-c",
      "sleep 15 && psql -w --host=db --port=5432 -d $PGDATABASE -c 'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)'",
    ]
  env:
    PGDATABASE: ${var.postgres-database}
    PGUSER: ${var.postgres-username}
    PGPASSWORD: ${var.postgres-password}

---
kind: Run
type: container
name: db-clear
dependencies: [deploy.db]
spec:
  image: postgres:12
  command: ["/bin/sh", "-c", "psql -w --host=db --port=5432 -d $PGDATABASE -c 'TRUNCATE votes'"]
  env:
    PGDATABASE: ${var.postgres-database}
    PGUSER: ${var.postgres-username}
    PGPASSWORD: ${var.postgres-password}
```

</div>

### vote/worker

<div style="columns: 2">

```yaml
kind: Module
description: The worker that collects votes and stores results in a postgres table
type: container
name: worker
services:
  - name: worker
    dependencies:
      - redis
      - db-init
    env:
      PGDATABASE: ${var.postgres-database}
      PGUSER: ${var.postgres-username}
      PGPASSWORD: ${var.postgres-password}
```

```yaml
kind: Build
type: container
name: worker

---
kind: Deploy
type: container
name: worker
description: The worker that collects votes and stores results in a postgres table
build: worker
# Note the much more granular dependency control!
dependencies:
  - deploy.redis
  - run.db-init
spec:
  env:
    PGDATABASE: ${var.postgres-database}
    PGUSER: ${var.postgres-username}
    PGPASSWORD: ${var.postgres-password}
```

</div>

## Mixed use of Garden Acorn (0.12) and Bonsai (0.13)

For backwards compatibility, Garden Bonsai will default to `apiVersion: garden.io/v0` in your project configuration (`kind: Project`).

Using `apiVersion: garden.io/v0` enables teams to gradually move to Bonsai, one team member at a time, because members can already choose to use Bonsai, while still being able to use Acorn (`0.12`) when necessary.

As soon as your project is using [Actions](../using-garden/actions.md), `apiVersion: garden.io/v1` becomes mandatory in the project configuration.. From that point on, team members can no longer use Acorn (`0.12`) as it does not recognize `apiVersion: garden.io/v1`. Therefore team members are forced to update to Bonsai (`0.13`).

When using Garden Cloud, features like triggered workflows or 1-Click Preview Environments, Garden Cloud will use Bonsai (`0.13`) with `apiVersion: garden.io/v1` or Acorn (`0.12`) with `apiVersion: garden.io/v0`. See also the [Garden Cloud workflows documentation](https://cloud.docs.garden.io/features/workflows).

### Where is the documentation for modules?

The reference documentation can be found [here](../reference/module-types/README.md),
but all other documentation has been rewriten to be action specific. If you need to keep working
with modules with Bonsai you can reference the 0.12 documentation.

### Detecting module/action mode

In 0.12 often string templating was used to detect sync mode and change behaviour accordingly.
This can be done much easier with Bonsai via the
[`${actions.deploy.<name>.mode}`](../reference/action-types/Deploy/container.md#actionsdeploynamemode)
template string or `${this.mode}` if referenced in the action itself,
but that would not be backward compatible with 0.12.
Below is an example config that works with both Bonsai and 0.12.
In this block the variables `sync-mode` or `dev-mode` are
set to true if the relative mode is requested for the `api` service/deploy.

```yml
variables:
  sync-mode: ${command.params contains 'sync' && (command.params.sync contains 'api' || isEmpty(command.params.sync))}
  dev-mode: ${command.name == 'dev' || (command.params contains 'dev-mode' && (command.params.dev-mode contains 'api' || isEmpty(command.params.dev-mode)))}
```

Sync mode or dev mode have been requested if either `var.sync-mode` or `var.dev-mode` are true. You can use a template expression like `${var.sync-mode || var.dev-mode ? 'yes' : 'no'}` to change the behaviour of your actions or modules.
