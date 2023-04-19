# Migrating your configuration for Bonsai

**Bonsai** is the codename for the Garden command line tool release version 0.13.

There are some changes in the configuration format in this version, but fear not: Bonsai is _mostly backwards compatible_ with the old configuration. There are very few breaking changes that require editing the existing configuration files - your projects should mostly just work when updating the Garden command line tool.

On the other hand, the optional new configuration format is easier to read and write, provides much more flexibility, and adds some completely new functionalities. We encourage migrating to the new configuration format when you feel the time is right in your project.

## Breaking changes first

Here is the list of breaking changes when upgrading your `garden` CLI tool. This lets you use your old Module-style configuration files with minimal changes.

- `cert-manager` integration has been deprecated. New documentation coming soon here: [ext dns and cert manager example](https://github.com/garden-io/garden/pull/3988)
- `dev-mode` has been renamed to `sync`, both in the configuration as well as on the CLI
- `garden delete` has been renamed to `garden cleanup`
- `garden delete env` has been renamed to `garden cleanup namespace` with an alias of `garden cleanup ns`
- `dotIgnoreFiles` has been renamed to `dotIgnoreFile` and only supports one file
- project config `modules.*` will be renamed to `scan.*`: [tracking issue](https://github.com/garden-io/garden/issues/3512)
- removed default `environments`, please specify the field in project configuration
- template configurations will use `camelCase` everywhere, no more `snake_case` or `kebab-case`: [tracking issue](https://github.com/garden-io/garden/issues/3513)
- the deprecated `hot-reload` has been removed, use `sync` instead
- the deprecated `cluster-docker` build mode has been removed, use `cluster-buildkit` or `kaniko` instead
- dropped support for deploying an in-cluster registry, see the [in-cluster build documentation](../k8s-plugins/remote-k8s/configure-registry/README.md)
- dropped support for the following providers:
  - `google-app-engine`
  - `google-cloud-functions`
  - `local-google-cloud-functions`
  - `maven-container`
  - `npm-package`
  - `openfaas`

## Note before continuing

It is possible to use both the old Module configuration and new Action configuration in the same project. This should make it easier to convert projects piece by piece.

However, there are some caveats:

- Modules cannot depend on actions
- Modules cannot reference actions
- Actions can reference and depend on modules, by referencing the actions that are generated from modules

This means that converting your project to the actions config can be performed gradually by starting from the end of the dependency tree.

The general flow of the Garden runtime is as follows:

- Modules are resolved
- Modules are converted to actions
- Actions are resolved

## Opt in to the new format

Here are a couple of examples of converting existing Module-style configuration to the new Action-based configuration format. This requires more effort, but should be pretty rewarding.

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

# The services section becomes a Deploy action
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

# The tests list becomes individual Test actions
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
ind: Module
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
# Note here the much more granular dependency control
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
