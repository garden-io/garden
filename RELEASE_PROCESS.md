# Release process

We have a dedicated release branch, `latest-release-0.13`, off of which we create our releases using our [release script](https://github.com/garden-io/garden/blob/0.13/scripts/release.ts). Once we're ready to release, we reset the `latest-release-0.13` branch to `0.13` and create a pre-release with the script. If there are issues with the pre-release, we merge the fixes to `main` and cherry-pick them to the `latest-release-0.13` branch. We repeat this process until all issues have been resolved and we can make a proper release.

This procedure allows us to continue merging features into `0.13` without them being included in the release.

On every merge to `0.13` we also publish an **unstable** release with the version `edge-bonsai` that is always flagged as a pre-release.

## Release script

The [release script](https://github.com/garden-io/garden/blob/0.13/scripts/release.ts) has the signature:

```sh
./scripts/release.ts <minor | patch | preminor | prepatch | prerelease> [--force] [--dry-run]
```

and does the following:

- Checks out a branch named `release-<version>`.
- Updates `core/package.json`, `core/package-lock.json` and `CHANGELOG.md`.
- Commits the changes, tags the commit, and pushes the tag and branch.
- Pushing the tag triggers a CI process that creates the release artifacts and publishes them to GitHub. If the release is not a pre-release, we create a draft instead of actually publishing.

## Steps

To make a new release, set your current working directory to the garden root directory and follow the steps below.

### 1. Prepare release

First, you need to prepare the release binaries and run some manual tests:

1. **Checkout to the `latest-release-0.13` branch**.
2. Reset `latest-release-0.13` to `0.13` with `git reset --hard origin/0.13`
3. Run `git log` to make sure that the latest commit is the expected one and there are no unwanted changes from `0.13` included in the release.
4. Run `./scripts/release.ts patch`. This way, the version bump commits and changelog entries created by the pre-releases are omitted from the final history.
5. Wait for the CI build job to get the binaries from the [GitHub Releases page](https://github.com/garden-io/garden/releases).

### 2. Publish and announce

Once the release CI job is done, a draft release will appear in GitHub. That draft release should be published and announced:

1. Go to our GitHub [Releases page](https://github.com/garden-io/garden/releases) and click the **Edit** button for the draft just created from CI. Note that for drafts, a new one is always created instead of replacing a previous one.
2. Write release notes. The notes should give an overview of the release and mention all relevant features. They should also **acknowledge all external contributors** and contain the changelog for that release.
  - Run `./scripts/draft-release-notes.ts <previous-tag> <current-tag>`, the filename with the draft notes will be printed in the console
  - Open the draft file (it's named `release-notes-${version}-draft.md`, e.g. `release-notes-0.12.38-draft.md`) and resolve all suggested TODO items
3. Click the **Publish release** button. **Do not mark it as the latest release.** Make sure that **Set as the latest release** option is **disabled** (it is enabled by default).
4. Make a pull request for the branch that was pushed by the script and make sure it's merged as soon as possible.
5. Update the [`CHANGELOG.md`](./CHANGELOG.md) if manual changes in the release nodes were necessary (e.g. removing commits that were reverted).
6. Run `npm install` and commit the updated `package-lock.json`.
7. Make sure the `latest-release-0.13` branch contains the released version, and push it to the remote. **This branch is used for our documentation, so this step is important.**
8. Check the `update-homebrew` GitHub Action run successfully and merge the relevant PR in the [homebrew repo](https://github.com/garden-io/homebrew-garden/pulls). **Use regular merge with the merge commit.**
9. Install the Homebrew package and make sure it works okay:
    - `brew tap garden-io/garden && brew install garden-cli@0.13 || true && brew update && brew upgrade garden-cli@0.13`
    - Run `$(brew --prefix garden-cli)/bin/garden dev` (to make sure you're using the packaged release) in an example project and see if all looks well.
10. Prepare the release announcement and publish it in our channels (Discord and Twitter). If not possible, delegate the task to an available contributor.
