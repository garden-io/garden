# Code Synchronization (Dev Mode)

You can synchronize your code (and other files) to and from running containers using _dev mode_.

Dev mode works similarly to the older [hot reloading functionality](./hot-reload.md), but is much faster and more reliable. It also supports bidirectional syncing, which enables you to sync new/changed files from your containers to your local machine.

This new sync mode uses [Mutagen](https://mutagen.io/) under the hood. Garden automatically takes care of fetching Mutagen, so you don't need to install any dependencies yourself to make use of dev mode.

Dev mode sync is not affected by the usual includes/excludes (e.g. rules defind in `.gardenignore` files), which makes it more flexible than hot reloading.

Instead, exclusion rules for dev mode are configured explicitly on the provider level and for each individual sync you configure—more on that below.

For example, you can use it to sync your `build`/`dist` directory into your container while running local, incremental builds (without having to remove those directories from your ignorefiles).

{% hint style="warning" %}
Please make sure to specify any paths that should not be synced by setting the provider-level default excludes and/or the `exclude` field on each configured sync! Otherwise you may end up syncing large directories and even run into application errors.
{% endhint %}

## Configuration

To configure a service for dev mode, add `devMode` to your module/service configuration to specify your sync targets:

### Configuring dev mode for `container` modules

```yaml
kind: Module
name: node-service
type: container
services:
  - name: node-service
    args: [npm, start]
    devMode:
      command: [npm, run, dev] # Overrides the container's default when the service is deployed in dev mode
      sync:
        # Source/target configuration for dev mode is the same as for hot reloading.
        - source: src
          target: /app/src
          # Make sure to specify any paths that should not be synced!
          exclude: [node_modules]
          mode: two-way
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

## Deploying with dev mode

To deploy your services with dev mode enabled, you can use the `deploy` or `dev` commands:

```sh
# Deploy specific services in dev mode:
garden deploy --dev myservice
garden deploy --dev myservice,my-other-service

# Deploy all applicable services in dev mode:
garden deploy --dev=*

# The dev command deploys services in dev mode by default:
garden dev myservice
```
Once your services have been deployed, any changes you make that fall under one of the sync specs you've defined will be automatically synced between your local machine and the running service.

Once you quit/terminate the Garden command, all syncs established by the command will be stopped (but the services will still be left running).

## Sync modes

Garden's dev mode supports several sync modes, each of which maps onto a Mutagen sync mode.

In brief: It's generally easiest to get started with the `one-way` or `two-way` sync modes, and then graduate to a more fine-grained setup based on `one-way-replicated` and/or `one-way-replicated-reverse` once you're ready to specify exactly which paths to sync and which files/directories to ignore from the sync.

### `one-way` (shorthand for `one-way-safe`)
* Syncs a local `source` path to a remote `target` path.
* When there are conflicts, does not replace/delete files in the remote `target` path.
* Simple to use, especially when there are files/directories inside the remote `target` that you don't want to override with the contents of the local `source`.
* On the other hand, if your setup / usage pattern is such that conflicts do sometimes arise for the `source`/`target` pair in question, you may want to use `one-way-replicated` instead.


### `one-way-replicated`
  * Syncs a local `source` path to a remote `target` path, such that `target` is always an exact mirror of `source` (with the exception of excluded paths).
  * When using this mode, there can be no conflicts—the contents of `source` always override the contents of `target`.
  * Since conflicts are impossible here, this mode tends to be a better / more reliable choice long-term than `one-way`/`one-way-safe`. However, you may need to configure more fine-grained/specific `source`/`target` pairs and their excludes such that you don't have problems with paths in the remote `target` being overwritten/deleted when they change in the local `source`.

### `one-way-reverse`
  * Same as `one-way`, except the direction of the sync is reversed.
  * Syncs a remote `target` path to a local `source` path.
  * Has the same benefits and drawbacks as `one-way`: Simple to configure, but conflicts are possible.

### `one-way-replicated-reverse`
  * Same as `one-way-replicated`, except the direction of the sync is reversed.
  * Syncs a remote `target` path to a local `source` path, such that `source` is always an exact mirror of `target` (with the exception of excluded paths).
  * When using this mode, there can be no conflicts—the contents of `target` always override the contents of `source`.

### `two-way` (maps to Mutagen's `two-way-safe`)
  * Bidirectionally syncs a local `source` to a remote `target` path.
  * Changes made in the local `source` will be synced to the remote `target`.
  * Changes made in the remote `target` will be synced to the local `source`.
  * When there are conflicts on either side, does not replace/delete the corresponding conflicting paths on the other side.
  * Similarly to `one-way`, this mode is simple to configure when there are files in either `source` or `target` that you don't want overriden on the other side when files change or are added/deleted.
  * Setting up several `one-way-replicated` and `one-way-replicated-reverse` syncs instead of `one-way` and `two-way` is generally the best approach long-term, but may require more fine-grained configuration (more sync specs for specific subpaths and more specific exclusion rules, to make sure things don't get overwritten/deleted in unwanted ways).

In addition to the above, please check out the [Mutagen docs on synchronization](https://mutagen.io/documentation/synchronization) for more info.

### Notes on Mutagen terminology

Mutagen uses the terminology "alpha" and "beta" for the sync endpoints. In Garden's `one-way`, `one-way-replicated` and `two-way` sync modes, alpha is `source` and beta is `target`.

For the reverse sync modes (`one-way-reverse` and `one-way-replicated-reverse`), alpha is `target` and beta is `source`.

## Excluding files and directories from syncs

By design, Garden's dev mode does not apply exclusion rules from ignorefiles (such as `.gardenignore` files) to dev mode syncs.

This is done to grant you more control over precisely which files and directories you'd like to sync while in dev mode.

For example, you might want to ignore `dist` or `build` directories (not version control them, not include them in builds or module versions), but still be able to sync them from your local machine to the running container (or from the running container to your local machine). This is easy to achieve with dev mode.

Exclusion rules can be specified on individual sync configs:
```yaml
kind: Module
name: node-service
type: container
services:
  - name: node-service
    args: [npm, start]
    devMode:
      command: [npm, run, dev]
      sync:
        - source: src
          target: /app/src
          exclude: [node_modules, tmp, "**/*.log"] # <------ paths matching these patterns won't be synced
          mode: two-way
  ...
```
Project-wide exclusion rules can be set on the `local-kubernetes` and `kubernetes` providers:
```yaml
kind: Project
...
providers:
  - name: kubernetes
    ...
    # Configure project-wide exclusion rules and default permission/ownership settings
    # for synced files/directories.
    devMode:
      defaults:
        exclude:
          - "/**/node_modules" # <--- with this, we don't have to specify `node_modules` on individual sync specs
```
This is great to reduce repetition in your excludes.

See the reference documentation for the [`kubernetes` provider](../reference/providers/kubernetes.md#providersdevmode)) for a full list of provider-level options for dev mode when using the `kubernetes` provider. The same dev-mode options are also available when using `local-kubernetes`.

## Permissions and ownership

In certain cases you may need to set a specific owner/group or permission bits on the synced files and directories at the target.

To do this, you can set a few options on each sync:

```yaml
kind: Module
description: Node greeting service
name: node-service
type: container
services:
  - name: node-service
    args: [npm, start]
    devMode:
      command: [npm, run, dev]
      sync:
        - target: /app
          exclude: [node_modules]
          defaultOwner: 1000  # <- set an integer user ID or a string name
          defaultGroup: 1000  # <- set an integer group ID or a string name
          defaultFileMode: 0666  # <- set the permission bits (as octals) for synced files
          defaultDirectoryMode: 0777  # <- set the permission bits (as octals) for synced directories
  ...
```

These options are passed directly to Mutagen. For more information, please see the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions).

### An advanced example

This example demonstrates several of the more advanced options that dev mode offers. For more details on the options available, see the sections above.
```yaml
kind: Project
...
providers:
  - name: kubernetes
    ...
    # Configure project-wide exclusion rules and default permission/ownership settings
    # for synced files/directories.
    devMode:
      defaults:
        exclude:
          - "/**/node_modules"
        owner: 1000  # <- set an integer user ID or a string name
        group: 1000  # <- set an integer group ID or a string name
        fileMode: 0666  # <- set the permission bits (as octals) for synced files
        directoryMode: 0777  # <- set the permission bits (as octals) for synced directories

---

kind: Module
description: |
  Here, we sync source code into the remote, and sync back the `test-artifacts` directory
  (populated when we run tests) back to the local machine.
name: node-service
type: container
services:
  - name: node-service
    args: [npm, start]
    devMode:
      command: [npm, run, dev] # Overrides the container's default when the service is deployed in dev mode.
      sync:
        # You can use several sync specs for the same service. It's generally a good idea to be specific about
        # what you want to sync, and to use `one-way-replica` or `one-way-replica-reverse` when possible to keep
        # things simple and avoid sync conflicts.
        - source: app
          target: /app
          # We don't need to exclude `node_modules` here, since above we added a
          # project-wide exclusion rule for that.
          # exclude: [node_modules]
          mode: one-way-replica
        - source: test-artifacts
          target: /test-artifacts
          # This syncs back any files/folders  on the remote to the local machine, always
          # overriding the local directory's contents with the remote one. See above for a detailed
          # description of each available sync mode.
          mode: one-way-replica-reverse
  ...
```
