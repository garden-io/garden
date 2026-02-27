---
title: Local Volume Mounts
order: 8
---

{% hint style="warning" %}
This feature is **experimental** and its configuration format may change in future releases.
{% endhint %}

Garden can automatically inject host-directory volume mounts into your local Kubernetes workloads, mapping directories from your machine directly into running containers. This is an alternative to [code synchronization](../../features/code-synchronization.md) that uses Kubernetes `hostPath` volumes instead of Mutagen-based file sync.

Local volume mounts are useful when you want:

- Instant file visibility with no sync delay
- Simple setup that works with any file watcher or hot-reload tool already in your container
- No background sync process to manage

The feature works with both `kubernetes` and `helm` Deploy actions.

## How it works

When you configure `localVolumes` on a Deploy action, Garden:

1. Resolves the `sourcePath` relative to the action's source directory into an absolute host path
2. Converts the host path to the correct format for your local cluster type and OS
3. Injects `hostPath` volumes and `volumeMounts` into the target workload's pod spec
4. Applies the modified manifests to the cluster
5. Verifies that the mounted files are visible inside the running pod

{% hint style="info" %}
Local volume mounts only work with local Kubernetes clusters (Docker Desktop, kind, minikube, Orbstack, etc.). They cannot be used with remote clusters because `hostPath` volumes reference the node's filesystem.
{% endhint %}

## Configuration

Add `localVolumes` to a `kubernetes` or `helm` Deploy spec:

```yaml
kind: Deploy
name: frontend
type: kubernetes
spec:
  manifestFiles: [./manifests/**/*]

  defaultTarget:
    kind: Deployment
    name: frontend
    containerName: frontend # Optional. Defaults to the first container.

  localVolumes:
    volumes:
      - name: frontend-src
        sourcePath: . # Relative to this action's source directory
        containerPath: /app # Absolute path inside the container
```

When `localVolumes.volumes` is defined, volume mounts are enabled automatically. You can explicitly disable them by setting `localVolumes.enabled: false`.

### Multiple volumes and per-volume targets

You can mount several directories and target different workloads or containers. Volumes without a `target` use the action's `spec.defaultTarget`:

```yaml
spec:
  defaultTarget:
    kind: Deployment
    name: backend
    containerName: app

  localVolumes:
    volumes:
      - name: backend-code
        sourcePath: backend
        containerPath: /var/code/backend

      - name: config-files
        sourcePath: config
        containerPath: /etc/app/config

      # This volume targets a different container in the same Deployment
      - name: sidecar-data
        target:
          kind: Deployment
          name: backend
          containerName: sidecar
        sourcePath: sidecar-data
        containerPath: /var/data
```

## Cluster-specific setup

Different local Kubernetes distributions handle host filesystem access differently. Garden automatically converts paths for each cluster type, but some require additional setup.

### Docker Desktop (macOS and Windows)

No special setup needed. Docker Desktop exposes the host filesystem automatically.

### Orbstack (macOS)

No special setup needed. Orbstack exposes the host filesystem at the same paths as the host.

### kind

kind runs Kubernetes inside Docker containers, so host directories must be explicitly mounted into the kind node. Add `extraMounts` to your kind cluster configuration:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /path/to/your/project
        containerPath: /path/to/your/project
```

{% hint style="warning" %}
If the kind cluster was created without `extraMounts`, you need to recreate it. Garden will verify the mount at deploy time and show an error with instructions if the mount is missing.
{% endhint %}

### minikube

minikube requires the `minikube mount` command to expose host directories. Garden will attempt to start this automatically at deploy time if the mount is not already active.

You can also start it manually:

```sh
minikube mount "/path/to/your/project:/path/to/your/project"
```

### Docker Desktop on Linux

Docker Desktop on Linux mounts the host filesystem at `/host_mnt`. Garden handles this path conversion automatically — no manual setup is needed.

### Path conversion summary

| Cluster type   | macOS                      | Linux                      | Windows                    |
| -------------- | -------------------------- | -------------------------- | -------------------------- |
| Docker Desktop | as-is                      | `/host_mnt` prefix         | Drive letter conversion    |
| Orbstack       | as-is                      | N/A                        | N/A                        |
| kind           | as-is (via extraMounts)    | as-is (via extraMounts)    | as-is (via extraMounts)    |
| minikube       | as-is (via minikube mount) | as-is (via minikube mount) | as-is (via minikube mount) |

## Interaction with code synchronization

Local volume mounts and [code synchronization](../../features/code-synchronization.md) (sync mode) serve a similar purpose but use different mechanisms. If both are configured on the same action, **local volume mounts take precedence** and sync mode is skipped with a warning.

If you want to use sync mode instead, set `localVolumes.enabled: false` or remove the `localVolumes` block.

## Excluding subdirectories from the mount

When you mount a host directory into a container path, it completely replaces whatever was at that path in the container image. This means dependencies installed during `docker build` (e.g. `node_modules`, Python virtualenvs) will be hidden by the mount.

The `excludes` field solves this by overlaying `emptyDir` volumes on top of the host mount at the specified subdirectories. The container sees an initially empty directory at each excluded path and can repopulate it at startup (e.g. via `npm install` in an entrypoint script).

```yaml
spec:
  defaultTarget:
    kind: Deployment
    name: frontend

  localVolumes:
    volumes:
      - name: frontend-src
        sourcePath: .
        containerPath: /app
        excludes:
          - node_modules
          - .cache
```

This generates three volumes:

1. A `hostPath` volume mounting the host directory at `/app`
2. An `emptyDir` volume at `/app/node_modules`
3. An `emptyDir` volume at `/app/.cache`

The container's entrypoint can then install dependencies into the empty `node_modules` directory without being affected by the host's potentially incompatible or missing `node_modules`.

{% hint style="info" %}
Each exclude entry is a path relative to `containerPath`. Nested paths like `vendor/bundle` are supported.
{% endhint %}

### When to use excludes vs. installing locally

| Approach                                     | Pros                                               | Cons                                                     |
| -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `excludes` + entrypoint install              | Works regardless of host OS, no local setup needed | Slower container startup (installs on every restart)     |
| Install locally (e.g. `npm install` on host) | Instant startup, shared dependencies               | Must match container's OS/arch, requires local toolchain |

You can also combine both: use `excludes` to mask the directory, then use an init container or entrypoint to copy dependencies from a known-good location in the image.

## Important notes

### Volume name requirements

Volume names must be valid Kubernetes DNS labels: lowercase alphanumeric characters or dashes, starting and ending with an alphanumeric character (e.g. `my-volume-1`).

### Source path requirements

The `sourcePath` must be a relative POSIX path within the action's source directory. Absolute paths and paths that escape the source directory (e.g. `../other-dir`) are not allowed.

## Example project

A complete example project is available in the Garden repository under [`examples/local-volume-mounts`](https://github.com/garden-io/garden/tree/0.14.20/examples/local-volume-mounts). It demonstrates a multi-service setup with a frontend using local volume mounts and a backend without.
