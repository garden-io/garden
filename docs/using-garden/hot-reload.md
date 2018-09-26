### Summary

When the `local-kubernetes` provider is used, `container` modules can now be configured to hot-reload their running services when the module's sources change (i.e. without redeploying).

For example, services that can be run with an FS watcher that automatically applies changed sources to the running application (e.g. nodemon, Django, Ruby on Rails, and many other web app frameworks) are a natural fit for this feature.

For those who like to read along, much of the action takes place in:

 https://github.com/garden-io/garden/blob/hot-reload/garden-cli/src/plugins/kubernetes/deployment.ts#L392-L460

and

https://github.com/garden-io/garden/blob/hot-reload/garden-cli/src/plugins/kubernetes/actions.ts#L230-L267

To see this in action, the `hot-reload` example project is a good place to start.

### Implementation

The current hot reload implementation (only for `container` modules in projects using the `local-kubernetes` provider) consists of the following:

* A set of k8s `emptyDir` volumes, representing the subdirs of the module to be synced. These are mounted at the `target` paths specified in the module's `garden.yml` (under `hotReload.sync`). The most common case will probably be a single `source` / `target` pair representing the module's top-level directory (resulting in one volume).
* A k8s init container using the service's image, which populates the above volumes according to the specifications in the module's `garden.yml`.
* An rsync sidecar container, deployed in the same pod as the service's own container, which runs an rsync server.
* Each of the volumes is mounted in the service's container (at the paths specified in the module's `garden.yml`), and in the rsync sidecar container.
* A `hotReload` module action, called via Garden's FS watcher when sources change for a module that is configured for hot reloading. `rsync` is used to sync the module's updated source files to the appropriate target paths inside each of its services' rsync sidecar containers.
* Each target path inside the rsync sidecar containers is contained in one of the above volumes. This therefore results in the updated source files being copied into the services' running containers.

### Semantics / usage

Currently, modules configured for hot reloading are only deployed in hot reload configuration (i.e. with the rsync sidecar, volumes and init container described above) when deployed via `garden deploy -w` or `garden dev` (and not, for example, when deployed via `garden deploy` without the `-w` flag).

Subsequently deploying a service (belonging to a module configured for hot reloading) via `garden deploy` (without the watch flag) results in the service being redeployed in "standard configuration", i.e. without the rsync sidecar, init container and sync volumes.

Since hot reloading currently happens via Garden's FS watcher, hot reloading only occurs while a `garden deploy -w` / `garden build -w` / `garden dev` command is running.

When a module is hot-reloaded, a build task for the module is simultaneously added, but unlike "cold" reloading (the default), no deploy task is added. Tasks for the hot reloaded module's build/service dependencies/dependants are added in the same way as during a cold reload.

Multiple directories:

```yaml
    sync:
      - source: /foo
        target: /app/foo
      - source: /bar
        target: /app/bar
```

Source is optional and defaults to `/`.