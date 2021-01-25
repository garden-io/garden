# Hot Reload

When the `local-kubernetes` or `kubernetes` provider is used, `container` modules can be configured to hot-reload their running services when the module's sources change \(i.e. without redeploying\). In essence, hot-reloading copies syncs files into the appropriate running containers \(local or remote\) when code is changed by the user, and optionally runs a post-sync command inside the container.

For example, services that can be run with a file system watcher that automatically updates the running application process when sources change \(e.g. nodemon, Django, Ruby on Rails, and many other web app frameworks\) are a natural fit for this feature.

## Usage

Currently, services are only deployed with hot reloading enabled when their names are passed to the `--hot` option via `garden deploy` or `garden dev` commands \(e.g. `garden dev --hot=foo-service,bar-service`\). If these services don't belong to a module defining a `hotReload` configuration \(see below for an example\), an error will be thrown if their names are passed to the `--hot` option.

You can also pass `*` \(e.g. `--hot=*`/`--hot-reload=*`\) to deploy all compatible services with hot reloading enabled \(i.e. all services belonging to a module that defines a `hotReload` configuration\).

Subsequently deploying a service belonging to a module configured for hot reloading via `garden deploy` \(without the watch flag\) results in the service being redeployed in standard configuration.

Since hot reloading is triggered via Garden's file system watcher, hot reloading only occurs while a watch-mode Garden command is running.

## Basic example

Following is an example of a module configured for hot reloading:

```yaml
kind: Module
description: My Test Service
name: test-service
type: container
hotReload:
  sync:
  - target: /app/
services:
  - name: test-service
    args: [npm, start]             # runs `node main.js`
    hotReloadArgs: [npm, run, dev] # runs `nodemon main.js`
```

In the above, the `hotReload` field specifies the destination path inside the running container that the module's \(top-level\) directory \(where its `garden.yml` resides\) is synced to.

Note that only files tracked in version control are synced, e.g. respecting `.gitignore`.

If a `source` is specified along with `target`, that subpath in the module's directory is synced to the target instead of the default of syncing the module's top-level directory.

You can configure several such `source`/`target` pairs, but note that the `source` paths must be disjoint, i.e. a `source` path may not be a subdirectory of another `source` path within the same module. Here's an example:

```yaml
  hotReload:
    sync:
      - source: /foo
        target: /app/foo
      - source: /bar
        target: /app/bar
```

Lastly, `hotReloadArgs` specifies the arguments to use to run the container \(when deployed with hot reloading enabled\). If no `hotReloadArgs` are specified, `args` is also used to run the container when the service is deployed with hot reloading enabled

## Adding a `postSyncCommand`

A `postSyncCommand` can also be added to a module's hot reload configuration. This command is executed inside the running container during each hot reload, after syncing is completed \(as the name suggests\).

Following is a snippet from the `hot-reload-post-sync-command` example project. Here, a `postSyncCommand` is used to `touch` a file, updating its modification time. This way, `nodemon` only has to watch one file to keep the running application up to date. See the `hot-reload-post-sync-command` example for more details and a fuller discussion.

```yaml
kind: Module
description: Node greeting service
name: node-service
type: container
hotReload:
  sync:
    - target: /app/
  postSyncCommand: [touch, /app/hotreloadfile]
services:
  - name: node-service
    args: [npm, start]
    hotReloadArgs: [npm, run, dev] # Runs modemon main.js --watch hotreloadfile
  ...
```

