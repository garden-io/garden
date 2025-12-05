# Build Sync Mode Example

This example demonstrates how to configure the `buildSyncMode` parameter in the Kubernetes provider to solve the issue of empty directories being left behind in `.garden/build` after file moves or deletions.

## Problem

When using Garden with the default build system (Mutagen), file deletions are propagated to `.garden/build`, but empty directories left behind after file moves or deletions are not removed. This results in outdated, empty folders being left in `.garden/build`, which can cause problems with tools like Prisma that rely on accurate directory structures (e.g., `prisma/migrations`).

## Solution

The `buildSyncMode` parameter allows you to configure the sync mode used for build synchronization. By default, it uses `one-way-replica` which is fast but may leave empty directories. You can change it to `two-way-resolved` to ensure empty directories are properly cleaned up.

## Configuration

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

## Usage

1. Add the `buildSyncMode` parameter to your Kubernetes provider configuration
2. Set it to `two-way-resolved` to ensure empty directories are cleaned up
3. Run your Garden commands as usual

## Example

```bash
# Deploy with the new configuration
garden deploy

# The .garden/build directory will now properly reflect the source directory structure
# Empty directories will be removed when files are moved or deleted
```

## Workarounds (Before This Feature)

If you were experiencing this issue before this feature was available, you could:

1. Delete `.garden/` manually after cleanup or after moving files:
   ```bash
   rm -rf .garden
   ```

2. Use `rsync` instead of Mutagen for syncing:
   ```bash
   GARDEN_K8S_BUILD_SYNC_MODE=rsync GARDEN_LEGACY_BUILD_STAGE=true garden deploy
   ```

3. Patch the Garden source code to use `two-way-resolved` sync mode instead of `one-way-replica`

## Benefits

- **Accurate directory structure**: Empty directories are properly removed
- **Better tool compatibility**: Works correctly with tools like Prisma that rely on directory structure
- **Configurable**: Choose the sync mode that best fits your workflow
- **Backward compatible**: Defaults to the previous behavior if not configured 