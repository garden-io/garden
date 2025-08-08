# Build Sync Mode Implementation Summary

## Overview

This document summarizes the changes made to implement the `buildSyncMode` parameter in the Kubernetes provider, which allows users to configure the sync mode used for build synchronization and solve the issue of empty directories being left behind in `.garden/build`.

## Problem Addressed

When using Garden with the default build system (Mutagen), file deletions are propagated to `.garden/build`, but empty directories left behind after file moves or deletions are not removed. This results in outdated, empty folders being left in `.garden/build`, which can cause problems with tools like Prisma that rely on accurate directory structures.

## Solution Implemented

A new `buildSyncMode` parameter was added to the Kubernetes provider configuration that allows users to specify the sync mode used for build synchronization. The default remains `"one-way-replica"` for backward compatibility, but users can now configure it to `"two-way-resolved"` to ensure empty directories are properly cleaned up.

## Files Modified

### 1. Core Configuration (`core/src/plugins/kubernetes/config.ts`)

**Changes:**
- Added `buildSyncMode?: SyncMode` to the `KubernetesConfig` interface
- Imported `SyncMode` type from container config
- Added `buildSyncMode` schema to `kubernetesConfigBase()` with:
  - Default value: `"one-way-replica"`
  - Description explaining the feature and its purpose
  - Reference to the Code Synchronization guide

### 2. Build Sync Function (`core/src/plugins/kubernetes/container/build/common.ts`)

**Changes:**
- Modified `syncToBuildSync()` function to use configurable sync mode
- Added logic to read `buildSyncMode` from provider config
- Defaults to `"one-way-replica"` for backward compatibility
- Replaced hardcoded `"one-way-replica"` with the configurable `syncMode` variable

### 3. Test File (`core/test/unit/src/plugins/kubernetes/build-sync-mode.ts`)

**Added:**
- New test file to verify the configuration works correctly
- Tests for both configured and default scenarios
- Basic type checking and configuration validation

### 4. Example Configuration (`examples/build-sync-mode/`)

**Added:**
- `garden.yml`: Example configuration showing how to use the feature
- `README.md`: Comprehensive documentation explaining the problem, solution, and usage

### 5. Documentation (`docs/misc/build-sync-mode.md`)

**Added:**
- Complete documentation for the new feature
- Problem description and solution explanation
- Configuration examples and usage patterns
- Migration guide from workarounds to proper configuration
- Technical details about the implementation

## Configuration Usage

### Basic Usage
```yaml
providers:
  - name: local-kubernetes
    buildSyncMode: two-way-resolved
```

### With Other Settings
```yaml
providers:
  - name: local-kubernetes
    buildSyncMode: two-way-resolved
    buildMode: kaniko
    context: my-cluster
```

## Available Sync Modes

- `one-way-replica` (default): Fast one-way sync, may leave empty directories
- `two-way-resolved`: Two-way sync that resolves conflicts and cleans up empty directories
- `one-way-safe`: Safe one-way sync with conflict detection
- `one-way`: Simple one-way sync
- `two-way`: Two-way sync with automatic conflict resolution
- `two-way-safe`: Safe two-way sync with conflict detection

## Benefits

1. **Accurate directory structure**: Empty directories are properly removed
2. **Better tool compatibility**: Works correctly with tools like Prisma that rely on directory structure
3. **Configurable**: Choose the sync mode that best fits your workflow
4. **Backward compatible**: Defaults to the previous behavior if not configured

## Migration from Workarounds

Users can now replace manual workarounds with proper configuration:

### Before (Workarounds)
```bash
# Option 1: Manual cleanup
rm -rf .garden

# Option 2: Use rsync
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

## Technical Implementation Details

1. **Type Safety**: Uses the existing `SyncMode` type from the container plugin
2. **Schema Validation**: Leverages the existing `syncModeSchema()` for validation
3. **Backward Compatibility**: Defaults to the previous hardcoded value when not configured
4. **Consistent API**: Follows the same patterns as other sync configurations in the codebase

## Testing

The implementation includes:
- Unit tests for configuration validation
- Type checking to ensure proper integration
- Example configurations for user testing
- Comprehensive documentation for user guidance

## Future Considerations

1. **Performance Impact**: `two-way-resolved` may be slightly slower than `one-way-replica`
2. **User Education**: Users need to understand the trade-offs between different sync modes
3. **Monitoring**: Consider adding logging to help users understand which sync mode is being used
4. **Documentation**: The feature is well-documented but may need integration into main docs

## Conclusion

This implementation provides a clean, configurable solution to the empty directory issue while maintaining backward compatibility. Users can now choose the sync mode that best fits their workflow, and the solution integrates seamlessly with the existing Garden architecture. 