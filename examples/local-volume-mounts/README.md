# Local Volume Mounts

This example demonstrates Garden's **local volume mounts** feature, which automatically injects `hostPath` volumes into your Kubernetes workloads during local development. Instead of rebuilding and redeploying every time you change a source file, you can mount your local directories directly into the running containers.

Garden handles the platform-specific path conversion automatically based on your local cluster type (Docker Desktop, kind, minikube) and operating system (macOS, Linux, Windows).

## Project Structure

```
.
├── garden.yml              # Project config with localVolumes enabled at the provider level
├── backend/
│   ├── backend.garden.yml  # Simple container Build + Deploy (no volumes)
│   ├── Dockerfile
│   └── main.go
└── frontend/
    ├── frontend.garden.yml # Container Build + kubernetes Deploy with localVolumes
    ├── manifests/
    │   ├── deployment.yaml
    │   └── service.yaml
    ├── Dockerfile
    ├── app.js
    ├── main.js
    └── package.json
```

## How It Works

### Provider-Level Configuration

In `garden.yml`, we enable local volumes globally for all Deploy actions:

```yaml
providers:
  - name: local-kubernetes
    localVolumes:
      enabled: true
```

### Action-Level Configuration

In `frontend/frontend.garden.yml`, we configure the volumes to mount:

```yaml
spec:
  localVolumes:
    defaultTarget:
      kind: Deployment
      name: frontend
      containerName: frontend
    volumes:
      - name: frontend-src
        sourcePath: .
        containerPath: /app
```

- **`defaultTarget`** specifies which resource and container to mount volumes into. This avoids repeating the same `kind`/`name`/`containerName` for every volume entry.
- **`volumes`** lists the directories to mount. Each entry has:
  - `name`: A unique identifier for the volume
  - `sourcePath`: Path relative to the action's source directory
  - `containerPath`: The absolute mount path inside the container

### Per-Volume Targeting

When volumes need to go into different resources or containers, you can specify a `target` on individual volumes to override the `defaultTarget`:

```yaml
spec:
  localVolumes:
    defaultTarget:
      kind: Deployment
      name: my-app
    volumes:
      - name: app-code
        sourcePath: src
        containerPath: /app/src
      - name: sidecar-config
        target:
          kind: Deployment
          name: my-app
          containerName: sidecar
        sourcePath: config
        containerPath: /etc/config
```

### Action-Level Override

You can also override the provider-level `enabled` setting per action:

```yaml
spec:
  localVolumes:
    enabled: false  # Disable for this specific action even if provider enables it
```

## Cluster-Type Support

Local volume mounts work with all local Kubernetes cluster types:

| Cluster Type | Path Handling |
|---|---|
| **Docker Desktop** (macOS) | Host paths are used as-is |
| **Docker Desktop** (Linux) | Host paths are prefixed with `/host_mnt` |
| **Docker Desktop** (Windows) | Drive letters are converted (e.g. `C:\Users\...` → `/run/desktop/mnt/host/c/Users/...`) |
| **Orbstack** (macOS) | Host paths are used as-is (same as Docker Desktop on macOS) |
| **kind** | Requires `extraMounts` in the kind cluster config. Garden validates this and provides instructions if missing. |
| **minikube** | Garden automatically starts `minikube mount` if the project directory is not already mounted. |

## Running the Example

1. Make sure you have a local Kubernetes cluster running (Docker Desktop, kind, or minikube).

2. Install frontend dependencies locally. Because the volume mount overlays the container's `/app` directory with your local `frontend/` directory, `node_modules` must exist locally:
   ```bash
   cd frontend && npm install && cd ..
   ```

3. Deploy:
   ```bash
   garden deploy
   ```

4. Garden will inject `hostPath` volumes into the frontend Deployment, mounting the local `frontend/` directory into `/app` in the container.

5. Edit `frontend/app.js` and the changes will be immediately visible inside the container (you may need to restart the Node.js process depending on your setup).

## kind Cluster Setup

If using kind, you need to configure `extraMounts` so the project directory is accessible inside the kind node:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /path/to/your/project
        containerPath: /path/to/your/project
```

Create the cluster with:
```bash
kind create cluster --config kind-config.yaml
```
