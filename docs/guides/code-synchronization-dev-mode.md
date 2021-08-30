# Code Synchronization (Dev Mode)

You can synchronize your code (and other files) to and from running containers using _dev mode_.

Dev mode works similarly to the older [hot reloading functionality](./hot-reload.md), but is much faster and more reliable. It also supports bidirectional syncing, which enables you to sync new/changed files from your containers to your local machine.

This new sync mode uses [Mutagen](https://mutagen.io/) under the hood. Garden automatically takes care of fetching Mutagen, so you don't need to install any dependencies yourself to make use of dev mode.

Dev mode sync is not affected by includes/excludes, which makes it more flexible than hot reloading. For example, you can use it to sync your `build`/`dist` directory into your container while running local, incremental builds (without having to remove those directories from your ignorefiles).

{% hint style="warning" %}
Please make sure to specify any paths that should not be synced, by setting the `exclude` field on each configured sync! Otherwise you may end up syncing large directories and even run into application errors.
{% endhint %}

## Configuration

To configure a service for dev mode, add `devMode` to your module/service configuration to specify your sync targets:

### Configuring dev mode for `container` modules

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
          # Make sure to specify any paths that should not be synced!
          exclude: [node_modules]
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
