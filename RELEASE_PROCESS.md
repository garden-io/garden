# Release process

## Overview

The release process is fully automated via GitHub Actions. A maintainer triggers the **Start Release** workflow, and everything else happens automatically: branch preparation, version bumping, CI builds, smoke testing, release notes generation, GitHub release publishing, Homebrew formula update, and post-release PR creation.

### Automated flow

```
Start Release workflow (triggered by maintainer)
  │
  ├─ Resets latest-release → main
  ├─ Runs release.ts (version bump, changelog, tag push)
  │
  ▼
CircleCI tags workflow (triggered by tag push)
  │
  ├─ Builds binaries (macOS, Linux, Windows, Alpine)
  ├─ Signs Windows binary
  ├─ Creates draft GitHub release with artifacts
  │
  ▼
Post-release workflow (triggered by draft release)
  │
  ├─ Downloads binary, runs smoke test
  ├─ Generates release notes from changelog
  ├─ Publishes the release (draft → published)
  │
  ▼
Publish release workflow (triggered by release publish)
  │
  ├─ Creates and merges Homebrew PR
  ├─ Creates PR for release branch → main (auto-merged)
  └─ Updates latest-release branch (used for docs)
```

## How to release

### One-click release (recommended)

1. Go to the [Start Release](../../actions/workflows/start-release.yml) workflow in GitHub Actions.
2. Click **Run workflow**.
3. Select the release type (`patch`, `minor`, etc.) and base branch (default: `main`).
4. Click **Run workflow** and wait for the full pipeline to complete.

That's it. The changelog-based release notes, Homebrew update, and post-release cleanup are all handled automatically.

After the release is published, you can edit the release notes on the [Releases page](https://github.com/garden-io/garden/releases) if any manual adjustments are needed (e.g. adding a summary, highlighting key changes).

### Editing release notes

The automated pipeline generates release notes from the changelog. To replace or supplement them with a hand-written summary (e.g. for a feature-heavy release), find the release here https://github.com/garden-io/garden/releases and edit the release notes.

### Manual release (fallback)

If the automated flow fails or you need more control, you can still release manually. The post-release automation detects manual releases (by checking the commit author) and skips auto-publishing, so you can safely edit the draft before publishing.

1. **Checkout to the `latest-release` branch**.
2. Reset `latest-release` to `main` with `git reset --hard origin/main`
3. Run `git log` to make sure the latest commit is the expected one.
4. Run `./scripts/release.ts patch` (or `minor`, etc.).
5. Wait for the CI build job to get the binaries from the [GitHub Releases page](https://github.com/garden-io/garden/releases).
6. Run the `dev` command in `examples/demo-project` and verify that no errors come up immediately.
7. Go to the [Releases page](https://github.com/garden-io/garden/releases) and edit the draft release.
8. Run `./scripts/draft-release-notes.ts <previous-tag> <current-tag>` to generate release notes.
   - Add `--manual` to get TODO placeholders to help with manual editing.
   - Without `--manual`, the notes are publish-ready with a default description.
9. Click **Publish release**.

Once you publish, the following automation kicks in automatically:
- Homebrew PR is created and merged
- Release branch → main PR is created with auto-merge enabled
- `latest-release` branch is updated to the released tag

## Release branches

We have dedicated release branches, `latest-release` and `latest-release-0.13`. These are the base branches for our releases. The `latest-release` branch is also used for deploying our documentation, so it must always point to the latest stable release.

On every merge to `main` we publish an **unstable** release with the version `edge-cedar` that is always flagged as a pre-release.

### Releasing 0.13

For `0.13`, use the `0.13` branch as the base branch in the Start Release workflow. This will use the `latest-release-0.13` branch.

On every merge to the `0.13` branch, we publish an **unstable** release with the version `edge-bonsai`.

## Release script

The [release script](scripts/release.ts) has the following signature:

```sh
./scripts/release.ts <minor | patch | preminor | prepatch | prerelease> [--force] [--dry-run] [--yes]
```

Flags:
- `--force`: Override existing tags
- `--dry-run`: Perform all steps except pushing tags/branches
- `--yes` / `-y`: Skip the interactive confirmation prompt (used by CI)

The script:
- Checks out a branch named `release-<version>`.
- Updates `package.json` versions and `CHANGELOG.md`.
- Commits the changes, tags the commit, and pushes the tag and branch.
- Pushing the tag triggers CircleCI to build artifacts and create a draft GitHub release.

## Release notes

Release notes are generated automatically by `scripts/draft-release-notes.ts`:

```sh
./scripts/draft-release-notes.ts <previous-tag> <current-tag> [--output-stdout] [--manual]
```

Features:
- Auto-detects external contributors via the GitHub API
- Extracts fixed issues from commit messages (`fixes #123`, `closes #123`)
- `--output-stdout`: Print notes to stdout instead of writing a file
- `--manual`: Include TODO placeholders for hand-editing (legacy behavior)

## GitHub Actions secrets

The following secrets are used by the release workflows:

| Secret | Purpose |
|--------|---------|
| `GITHUB_TOKEN` | Default token for GitHub API operations |
| `COMMITTER_TOKEN` | PAT (gordon-garden-bot) for Homebrew repo operations |

## Prerequisites

- **Allow auto-merge** must be enabled in the Garden repo settings (Settings > General) for the release PR auto-merge to work.
- **Branch protection on homebrew-garden** must allow the `COMMITTER_TOKEN` bot to merge without review approvals.

## Misc

### Homebrew

The `release-homebrew` job triggered on a new release (see [publish-release.yaml](.github/workflows/publish-release.yml)) creates and directly merges a PR on the [Homebrew repository](https://www.github.com/garden-io/homebrew-garden). The token used is stored as a secret under the name `COMMITTER_TOKEN`, owned by the [gordon-garden-bot](https://github.com/gordon-garden-bot) account.

### Pre-releases

Pre-releases are supported by the Start Release workflow (select `prerelease`, `preminor`, or `prepatch` as the release type). For pre-releases, CircleCI publishes the release directly (not as a draft), so the post-release automation (smoke test, release notes, Homebrew, release PR) is skipped — which is the desired behavior.

### Testing the full pipeline

To test the full post-release pipeline (smoke test → release notes → publish → Homebrew → release PR) without doing a real stable release, you can manually trigger the `post-release.yml` workflow:

1. Create a pre-release using the Start Release workflow
2. Manually convert it to a draft on the GitHub Releases page (Edit → check "Set as a pre-release", uncheck, then check "Set as draft")
3. Go to the [Post-release automation](../../actions/workflows/post-release.yml) workflow and trigger it manually with the tag name

Alternatively, the `post-release.yml` workflow can be triggered via `workflow_dispatch` at any time against an existing draft release for recovery or testing purposes.

### Edge releases

On every merge to `main`, CircleCI builds and publishes an edge release tagged `edge-cedar`. This is always marked as a pre-release and is useful for testing the latest changes before a stable release.
