# Hot Reload

When the `local-kubernetes` provider is used, `container` modules can be configured to hot-reload their running services when the module's sources change (i.e. without redeploying). In essence, hot-reloading copies source files into the appropriate running containers when code is changed by the user.

For example, services that can be run with a file system watcher that automatically update the running application process when sources change (e.g. nodemon, Django, Ruby on Rails, and many other web app frameworks) are a natural fit for this feature.

# Usage

Currently, modules configured for hot reloading are only deployed with hot reloading enabled when they're deployed via `garden deploy -w` or `garden dev`; and not, for example, when deployed via `garden deploy` without the `-w` flag.

Subsequently deploying a service belonging to a module configured for hot reloading via `garden deploy` (without the watch flag) results in the service being redeployed in standard configuration. (See [this link](https://github.com/garden-io/garden/pull/291) for a more technical discussion.)

Since hot reloading is triggered via Garden's file system watcher, hot reloading only occurs while a `garden deploy -w`, `garden build -w`, or `garden dev` command is running.

# Quick example

Following is a simple example of a module configured for hot reloading:

```yaml
module:
  description: My Test Service
  name: test-service
  type: container
  hotReload:
    sync:
    - target: /app/
  services:
    - name: test-service
      command: [npm, start]             # runs `node main.js`
      hotReloadCommand: [npm, run, dev] # runs `nodemon main.js`
```

In the above, the `hotReload` field specifies the destination path inside the running container that the module's (top-level) directory (where its `garden.yml` resides) is synced to.

Note that only files tracked in version control are synced, e.g. respecting `.gitignore`.

If a `source` is specified along with `target`, that subpath in the module's directory is synced to the target instead of the default of syncing the module's top-level directory.

You can configure several such `source`/`target` pairs, but note that the `source` paths must be disjoint, i.e. a `source` path may not be a subdirectory of another `source` path within the same module. Here's an example:

```yaml
    sync:
      - source: /foo
        target: /app/foo
      - source: /bar
        target: /app/bar
```

Lastly, `hotReloadCommand` determines which command should be run inside the container (when deployed with hot reloading enabled). If no `hotReloadCommand` is specified, `command` is also used in hot reload mode.
