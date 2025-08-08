# Build Sync Mode Configuration

## Overview

The `buildSyncMode` parameter allows you to configure the sync mode used for build synchronization in the Kubernetes provider. This feature addresses the issue of empty directories being left behind in `.garden/build` after file moves or deletions.

## Problem

When using Garden with the default build system (Mutagen), file deletions are propagated to `.garden/build`, but empty directories left behind after file moves or deletions are not removed. This results in outdated, empty folders being left in `.garden/build`, which can cause problems with tools like Prisma that rely on accurate directory structures (e.g., `prisma/migrations`).

## Solution

The `buildSyncMode` parameter allows you to configure the sync mode used for build synchronization. By default, it uses `one-way-replica` which is fast but may leave empty directories. You can change it to `two-way-resolved` to ensure empty directories are properly cleaned up.

## Configuration

Add the `buildSyncMode` parameter to your Kubernetes provider configuration:

```yaml
providers:
  - name: local-kubernetes
    buildSyncMode: two-way-resolved  # Clean up empty directories
```

## Available Sync Modes

- `one-way-replica` (default): Fast one-way sync, may leave empty directories
- `two-way-resolved`: Two-way sync that resolves conflicts and cleans up empty directories
- `one-way-safe`: Safe one-way sync with conflict detection
- `one-way`: Simple one-way sync
- `two-way`: Two-way sync with automatic conflict resolution
- `two-way-safe`: Safe two-way sync with conflict detection

## Usage Examples

### Basic Configuration

```yaml
apiVersion: garden.io/v2
kind: Project
name: my-project
environments:
  - name: local
providers:
  - name: local-kubernetes
    buildSyncMode: two-way-resolved
```

### With Other Kubernetes Provider Settings

```yaml
providers:
  - name: local-kubernetes
    buildSyncMode: two-way-resolved
    buildMode: kaniko
    context: my-cluster
    defaultHostname: api.mydomain.com
```

## Benefits

- **Accurate directory structure**: Empty directories are properly removed
- **Better tool compatibility**: Works correctly with tools like Prisma that rely on directory structure
- **Configurable**: Choose the sync mode that best fits your workflow
- **Backward compatible**: Defaults to the previous behavior if not configured

## Migration from Workarounds

If you were previously using workarounds for this issue, you can now use the proper configuration:

### Before (Workarounds)

1. Delete `.garden/` manually after cleanup:
   ```bash
   rm -rf .garden
   ```

2. Use `rsync` instead of Mutagen:
   ```bash
   GARDEN_K8S_BUILD_SYNC_MODE=rsync GARDEN_LEGACY_BUILD_STAGE=true garden deploy
   ```

### After (Proper Configuration)

```yaml
providers:
  - name: local-kubernetes
    buildSyncMode: two-way-resolved
```

Then simply run:
```bash
garden deploy
```

## Technical Details

The `buildSyncMode` parameter affects the sync mode used in the `syncToBuildSync` function in `core/src/plugins/kubernetes/container/build/common.ts`. When not configured, it defaults to `"one-way-replica"` for backward compatibility.

The parameter is validated using the same schema as other sync modes in the container plugin, ensuring consistency across the codebase. 