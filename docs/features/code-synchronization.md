---
title: Code Synchronization
order: 60
---

Garden includes a *sync* mode that allows you to rapidly synchronize your code (and other files) to and from running containers.

The sync mode uses [Mutagen](https://mutagen.io/) under the hood. Garden automatically takes care of fetching Mutagen, so you don't need to install any dependencies yourself to make use of sync mode.

{% hint style="info" %}
This feature used to be called _dev mode_ but as of version 0.13 we've opted for more straightforward terminology.
The functionality is exactly the same as before.
{% endhint %}

## Configuration

{% hint style="warning" %}
Please make sure to specify any paths that should not be synced by setting the provider-level default excludes and/or the `exclude` field on each configured sync! Otherwise you may end up syncing large directories and even run into application errors.
{% endhint %}

To configure a service for sync mode, add `sync` to your Deploy configuration to specify your sync targets:

### Configuring sync for `container` modules

```yaml
kind: Deploy
name: node-service
type: container
dependencies:
  - build.node-service-build
spec:
  image: ${actions.build.node-service-build.outputs.deploymentImageId}
  args: [ npm, run, serve ]
  sync:
    paths:
      - target: /app/src
        source: src
        mode: two-way
        exclude: [ node_modules ]
...
```

### Configuring sync for `kubernetes` and `helm` modules

```yaml
kind: Deploy
type: kubernetes # this example looks the same for helm modules (i.e. with `type: helm`)
name: node-service
spec:
  defaultTarget:
    kind: Deployment
    name: vote
  sync:
    paths:
      - containerPath: /app/src
        sourcePath: /src
        mode: two-way
    overrides:
      - command: [ npm, run, dev ]
...
```

## Deploying with sync enabled

To deploy your services with sync enabled, you can use the `deploy` command:

```sh
# Deploy specific services in sync mode:
garden deploy --sync myservice
garden deploy --sync myservice,my-other-service

# Deploy all applicable services with sync enabled:
garden deploy --sync=*
```

Once your deploys are ready, any changes you make that fall under one of the sync specs you've defined will be automatically synced between your local machine and the running service.

Once you quit/terminate the Garden command, the deploys and syncs will keep running in the background. To stop the syncs you can use the `sync stop` command.

## Sync modes

Garden supports several sync modes, each of which maps onto a Mutagen sync mode.

In brief: It's generally easiest to get started with the `one-way` or `two-way` sync modes, and then graduate to a more fine-grained setup based on `one-way-replica` and/or `one-way-replica-reverse` once you're ready to specify exactly which paths to sync and which files/directories to ignore from the sync.

### `one-way-safe` (or alias `one-way`)

* Syncs a local `source` path to a remote `target` path.
* When there are conflicts, does not replace/delete files in the remote `target` path.
* Simple to use, especially when there are files/directories inside the remote `target` that you don't want to override with the contents of the local `source`.
* On the other hand, if your setup / usage pattern is such that conflicts do sometimes arise for the `source`/`target` pair in question, you may want to use `one-way-replica` instead.

### `one-way-replica`

* Syncs a local `source` path to a remote `target` path, such that `target` is always an exact mirror of `source` (with the exception of excluded paths).
* When using this mode, there can be no conflicts—the contents of `source` always override the contents of `target`.
* Since conflicts are impossible here, this mode tends to be a better / more reliable choice long-term than `one-way`/`one-way-safe`. However, you may need to configure more fine-grained/specific `source`/`target` pairs and their excludes such that you don't have problems with paths in the remote `target` being overwritten/deleted when they change in the local `source`.

### `one-way-reverse`

* Same as `one-way`, except the direction of the sync is reversed.
* Syncs a remote `target` path to a local `source` path.
* Has the same benefits and drawbacks as `one-way`: Simple to configure, but conflicts are possible.

### `one-way-replica-reverse`

* Same as `one-way-replica`, except the direction of the sync is reversed.
* Syncs a remote `target` path to a local `source` path, such that `source` is always an exact mirror of `target` (with the exception of excluded paths).
* When using this mode, there can be no conflicts—the contents of `target` always override the contents of `source`.

### `two-way-safe` (or alias `two-way`)

* Bidirectionally syncs a local `source` to a remote `target` path.
* Changes made in the local `source` will be synced to the remote `target`.
* Changes made in the remote `target` will be synced to the local `source`.
* When there are conflicts on either side, does not replace/delete the corresponding conflicting paths on the other side.
* Similarly to `one-way`, this mode is simple to configure when there are files in either `source` or `target` that you don't want overridden on the other side when files change or are added/deleted.
* Setting up several `one-way-replica` and `one-way-replica-reverse` syncs instead of `one-way` and `two-way` is generally the best approach long-term, but may require more fine-grained configuration (more sync specs for specific subpaths and more specific exclusion rules, to make sure things don't get overwritten/deleted in unwanted ways).

### `two-way-resolved`

Same as `two-way-safe` except:

* Changes made in the local `source` will always win any conflict. This includes cases where alpha’s deletions would overwrite beta’s modifications or creations
* No conflicts can occur in this synchronization mode.

In addition to the above, please check out the [Mutagen docs on synchronization](https://mutagen.io/documentation/synchronization) for more info.

### Notes on Mutagen terminology

Mutagen uses the terminology "alpha" and "beta" for the sync endpoints. In Garden's `one-way`, `one-way-replica` and `two-way` sync modes, alpha is `source` and beta is `target`.

For the reverse sync modes (`one-way-reverse` and `one-way-replica-reverse`), alpha is `target` and beta is `source`.

## Excluding files and directories from syncs

By design, exclusion rules from ignorefiles (such as `.gardenignore` files) are not applied to syncs.

This is done to grant you more control over precisely which files and directories you'd like to sync.

For example, you might want to ignore `dist` or `build` directories in general usage, but still be able to sync them from your local machine to the running container (or from the running container to your local machine). This is easy to achieve with the right configuration.

Exclusion rules can be specified on individual sync configs:

```yaml
kind: Deploy
name: node-service
type: container
dependencies:
  - build.node-service-build
spec:
  image: ${actions.build.node-service-build.outputs.deploymentImageId}
  args: [ npm, run, serve ]
  sync:
    paths:
      - target: /app/src
        source: src
        mode: two-way
        exclude: [ node_modules, tmp, "**/*.log" ] # <------ paths matching these patterns won't be synced
...
```

Project-wide exclusion rules can be set on the `local-kubernetes` and `kubernetes` providers:

```yaml
apiVersion: garden.io/v2
kind: Project
...
providers:
  - name: kubernetes
    ...
    # Configure project-wide exclusion rules and default permission/ownership settings
    # for synced files/directories.
    sync:
      defaults:
        exclude:
          - "/**/node_modules" # <--- with this, we don't have to specify `node_modules` on individual sync specs
```

This is great to reduce repetition in your excludes.

See the reference documentation for the [`kubernetes` provider](../reference/providers/kubernetes.md#providerssync)) for
a full list of provider-level options for sync when using the `kubernetes` provider. The same sync options are also
available when using `local-kubernetes`.

## Permissions and ownership

In certain cases you may need to set a specific owner/group or permission bits on the synced files and directories at
the target.

To do this, you can set a few options on each sync:

```yaml
kind: Deploy
name: node-service
type: container
dependencies:
  - build.node-service-build
spec:
  image: ${actions.build.node-service-build.outputs.deploymentImageId}
  sync:
    paths:
      - target: /app/src
        source: src
        mode: two-way
        exclude: [ node_modules ]
        defaultOwner: 1000  # <- set an integer user ID or a string name
        defaultGroup: 1000  # <- set an integer group ID or a string name
        defaultFileMode: 0666  # <- set the permission bits (as octals) for synced files
        defaultDirectoryMode: 0777  # <- set the permission bits (as octals) for synced directories
...
```

These options are passed directly to Mutagen. For more information, please see
the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions).

### An advanced example

This example demonstrates several of the more advanced options. For more details on the options available, see the
sections above.

```yaml
apiVersion: garden.io/v2
kind: Project
...
providers:
  - name: kubernetes
    ...
    # Configure project-wide exclusion rules and default permission/ownership settings
    # for synced files/directories.
    sync:
      defaults:
        exclude:
          - "/**/node_modules"
        owner: 1000  # <- set an integer user ID or a string name
        group: 1000  # <- set an integer group ID or a string name
        fileMode: 0666  # <- set the permission bits (as octals) for synced files
        directoryMode: 0777  # <- set the permission bits (as octals) for synced directories

---

kind: Deploy
name: node-service
type: container
description: |
  Here, we sync source code into the remote, and sync back the `test-artifacts` directory
  (populated when we run tests) back to the local machine.
dependencies:
  - build.node-service-build
spec:
  image: ${actions.build.node-service-build.outputs.deploymentImageId}
  args: [ npm, start ]
  sync:
    # Overrides the container's default when the service is deployed in sync mode.
    command: [ npm, run, dev ]
    # You can use several sync specs for the same service. It's generally a good idea to be specific about
    # what you want to sync, and to use `one-way-replica` or `one-way-replica-reverse` when possible to keep
    # things simple and avoid sync conflicts.
    paths:
      - containerPath: /app/src
        sourcePath: /app/src
        # We don't need to exclude `node_modules` here, since above we added a
        # project-wide exclusion rule for that.
        # exclude: [node_modules]
        mode: one-way-replica
      - containerPath: /test-artifacts
        sourcePath: /test-artifacts
        # This syncs back any files/folders  on the remote to the local machine, always
        # overriding the local directory's contents with the remote one. See above for a detailed
        # description of each available sync mode.
        mode: one-way-replica-reverse
...
```

## Troubleshooting

Every so often something comes up in the underlying Mutagen synchronization process, which may not be visible in the
Garden CLI logs. To figure out what the issue may be (say, ahead of reporting a GitHub issue for Garden), it's useful to
be able to use the `mutagen` CLI directly.

Because Garden creates a temporary data directory for Mutagen for every Garden CLI instance, you can't use the `mutagen`
CLI without additional context. However, to make this easier, a symlink to the temporary directory is automatically
created under `<project root>/.garden/mutagen/<random ID>`, as well as a `mutagen.sh` helper script within that
directory that sets the appropriate context and links to the automatically installed Mutagen CLI. We also create
a `<project root>/.garden/mutagen/latest` symlink for convenience.

### Get list of active syncs

To get the current list of active syncs in an active Garden process, you could run the following from the project root
directory:

```sh
garden util mutagen sync list
```

### Restarting sync daemon

Starting from the version `0.13.26`, Garden offers a new file synchronization machinery.
It is available via the environment variable `GARDEN_ENABLE_NEW_SYNC` and it disabled by default up until version `0.13.32`.

Starting from the version `0.13.34`, the new synchronization machinery is enabled by default.

From version `0.13.44` the old synchronization machinery is completely removed together with the `GARDEN_ENABLE_NEW_SYNC` variable.

It is important to stop all syncs and the sync daemon before changing the value of `GARDEN_ENABLE_NEW_SYNC`, or upgrading to the version `0.13.33` or higher, or downgrading from `0.13.33+` to a lower version. Otherwise, the code synchronization won't work and Garden will fail with an error.

#### Switching from the old sync machinery to the new one (Garden `>=0.13.26` and `<=0.13.33`)

To stop the old sync daemon and to deploy with new sync mode, you need to run the following commands from the project root directory:

```
GARDEN_ENABLE_NEW_SYNC=false garden util mutagen daemon stop
GARDEN_ENABLE_NEW_SYNC=true garden deploy --sync
```

#### Switching from the new sync machinery to the old one (Garden `>=0.13.26` and `<=0.13.33`)

To stop the new sync daemon and to deploy with old sync mode, you need to run the following commands from the project root directory:

```
GARDEN_ENABLE_NEW_SYNC=true garden util mutagen daemon stop
GARDEN_ENABLE_NEW_SYNC=false garden deploy --sync
```

#### Switching from the new sync machinery to the old one when downgrading from Garden `>=0.13.44`

When downgrading, to stop the new sync daemon and to deploy with old sync mode, you need to run the following commands from the project root directory:

```sh
# If you are downgrading to Garden >= 0.13.33
garden util mutagen daemon stop
garden self-update <your-preferred-version>
garden deploy --sync

# If you are downgrading to Garden >= 0.13.26 and <=0.13.32 and want to use the old sync machinery
garden util mutagen daemon stop
garden self-update <your-preferred-version>
GARDEN_ENABLE_NEW_SYNC=false garden deploy --sync

```

#### Manually stopping lingering mutagen processes

If experience any lingering Mutagen processes, you can use the following command to find and kill them:

```sh
kill -9 $(pgrep mutagen)
```
