# Hot Reload

{% hint style="info" %}
Check out the section below on the brand-new, faster (and still experimental) dev mode—which includes bidirectional sync!
{% endhint %}

When the `local-kubernetes` or `kubernetes` provider is used, `container` modules can be configured to hot-reload their running services when the module's sources change (i.e. without redeploying). In essence, hot-reloading copies syncs files into the appropriate running containers (local or remote) when code is changed by the user, and optionally runs a post-sync command inside the container.

For example, services that can be run with a file system watcher that automatically updates the running application process when sources change (e.g. nodemon, Django, Ruby on Rails, and many other web app frameworks) are a natural fit for this feature.

## Usage

Currently, services are only deployed with hot reloading enabled when their names are passed to the `--hot` option via `garden deploy` or `garden dev` commands (e.g. `garden dev --hot=foo-service,bar-service`). If these services don't belong to a module defining a `hotReload` configuration (see below for an example), an error will be thrown if their names are passed to the `--hot` option.

You can also pass `*` (e.g. `--hot=*`/`--hot-reload=*`) to deploy all compatible services with hot reloading enabled (i.e. all services belonging to a module that defines a `hotReload` configuration).

Subsequently deploying a service belonging to a module configured for hot reloading via `garden deploy` (without the watch flag) results in the service being redeployed in standard configuration.

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
  - target: /app
services:
  - name: test-service
    args: [npm, start]             # runs `node main.js`
    hotReloadArgs: [npm, run, dev] # runs `nodemon main.js`
```

In the above, the `hotReload` field specifies the destination path inside the running container that the module's (top-level) directory (where its `garden.yml` resides) is synced to.

Note that only files tracked in version control are synced, e.g. respecting `.gitignore`.

If a `source` is specified along with `target`, that subpath in the module's directory is synced to the target instead of the default of syncing the module's top-level directory.

You can configure several such `source`/`target` pairs, but note that the `source` paths must be disjoint, i.e. a `source` path may not be a subdirectory of another `source` path within the same module. Here's an example:

```yaml
  hotReload:
    sync:
      - source: foo
        target: /app/foo
      - source: bar
        target: /app/bar
```

Lastly, `hotReloadArgs` specifies the arguments to use to run the container (when deployed with hot reloading enabled). If no `hotReloadArgs` are specified, `args` is also used to run the container when the service is deployed with hot reloading enabled

## Adding a `postSyncCommand`

A `postSyncCommand` can also be added to a module's hot reload configuration. This command is executed inside the running container during each hot reload, after syncing is completed (as the name suggests). 

Following is a snippet from the `hot-reload-post-sync-command` example project. Here, a `postSyncCommand` is used to `touch` a file, updating its modification time. This way, `nodemon` only has to watch one file to keep the running application up to date. See the `hot-reload-post-sync-command` example for more details and a fuller discussion.

```yaml
kind: Module
description: Node greeting service
name: node-service
type: container
hotReload:
  sync:
    - target: /app
  postSyncCommand: [touch, /app/hotreloadfile]
services:
  - name: node-service
    args: [npm, start]
    hotReloadArgs: [npm, run, dev] # Runs modemon main.js --watch hotreloadfile
  ...
```

## Dev mode (experimental)

Dev mode works similarly to hot reloading, but is much faster and more reliable. It also supports bidirectional syncing, which enables you to sync new/changed files from your containers to your local machine.

This new sync mode uses [Mutagen](https://mutagen.io/) under the hood. Garden automatically takes care of fetching Mutagen, so you don't need to install any dependencies yourself to make use of dev mode.

Dev mode sync is not affected by includes/excludes, which makes it more flexible than hot reloading. For example, you can use it to sync your `build`/`dist` directory into your container while running local, incremental builds (without having to remove those directories from your ignorefiles).

Eventually, the plan is to deprecate hot reloading in favor of dev mode.

Dev mode opens up exciting, productive new ways to set up your inner dev loop with Garden. Happy hacking!

Dev mode is currently supported for `container`, `kubernetes` and `helm` modules.

To configure a service for dev mode, add `devMode` to your module/service configuration:

### `container` module example
```yaml
kind: Module
description: Node greeting service
name: node-service
type: container
services:
  - name: node-service
    args: [npm, start]
    devMode:
      command: [npm, run, dev] # Overrides the container's default when the service is deployed in dev mode
      sync:
        # Source/target configuration for dev mode is the same as for hot reloading.
        - target: /app
        # You can use several sync specs for the same service.
        - source: /tmp/somedir
          target: /somedir
  ...
```

### Configuring dev mode for `kubernetes` and `helm` modules
```yaml
kind: Module
type: kubernetes # this example looks the same for helm modules (i.e. with `type: helm`)
name: node-service
# For `kubernetes` and `helm` modules, the `devMode` field is located at the top level.
devMode:
  command: [npm, run, dev]
  sync:
    - target: /app
    - source: /tmp/somedir
      target: /somedir
serviceResource:
  kind: Deployment
  name: node-service-deployment
  containerModule: node-service-image
  containerName: node-service
...
```
To deploy your services with dev mode enabled, you can use the `deploy` or `dev` commands:
```
garden deploy --dev myservice
garden deploy --dev myservice,my-other-service
garden dev myservice # the dev command deploys services in dev mode by default
```
