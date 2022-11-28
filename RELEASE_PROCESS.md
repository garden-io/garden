# Release process

We have a dedicated release branch, `latest-release`, off of which we create our releases using our [release script](https://github.com/garden-io/garden/blob/main/scripts/release.ts). Once we're ready to release, we reset the `latest-release` branch to `main` and create a pre-release with the script. If there are issues with the pre-release, we merge the fixes to `main` and cherry-pick them to the `latest-release` branch. We repeat this process until all issues have been resolved and we can make a proper release.

This procedure allows us to continue merging features into `main` without them being included in the release.

On every merge to `main` we also publish an **unstable** release with the version `edge` that is always flagged as a pre-release.

## Release script

The [release script](https://github.com/garden-io/garden/blob/main/scripts/release.ts) has the signature:

```sh
./scripts/release.ts <minor | patch | preminor | prepatch | prerelease> [--force] [--dry-run]
```

and does the following:

- Checks out a branch named `release-<version>`.
- Updates `core/package.json`, `core/yarn.lock` and `CHANGELOG.md`.
- Commits the changes, tags the commit, and pushes the tag and branch.
- Pushing the tag triggers a CI process that creates the release artifacts and publishes them to GitHub. If the release is not a pre-release, we create a draft instead of actually publishing.

## Steps

To make a new release, set your current working directory to the garden root directory and follow the steps below.

1. **Checkout to the `latest-release` branch**.
2. Make the first pre-release:
   - Reset `latest-release` to `main` with `git reset --hard origin/main`.
   - Run `git log` to make sure that the latest commit is the expected one and there are no unwanted changes from `main` included in the release.
   - Run `./scripts/release.ts preminor|prepatch`.
   - Wait for the CI build job to get the binaries from the [Github Releases page](https://github.com/garden-io/garden/releases).
3. Manual testing (using the pre-release/release binary)
   - On **macOS** or **Linux**, run the `./scripts/test-release.sh <version>` script, where `<version>` should have the format `<major>.<minor>.<patch>-<preReleaseCounter>`, e.g. `0.12.38-0`. The script runs some simple tests to sanity check the release.
   - On a **Windows** machine, run `garden deploy --dev vote --env remote` in the `vote` example project.
   - If there are any issues with syncing, consider changing the `services[].devMode.sync[].mode` value(s) to `one-way-replica` and restarting Garden.
   - Change a file in the `vote` service and verify that the code synchronization was successful.
   - Open the dashboard, verify that the initial page loads without errors.
4. You might need to include some additional commits here. For example, if any other fix(es) should be included from `main`, or if there are any test failures. In that case ypou need a new pre-release:
   - Checkout to the most recent pre-release branch, e.g. `1.2.3-0`, and cherry-pick the appropriate commits from `main`.
   - Run `./scripts/release.ts prerelease` - it will generate a new pre-release `1.2.3-1`.
   - Repeat the manual testing.
5. If you’re ready to make a proper release, do the following:
   - Checkout to the most recent pre-release branch, e.g. `1.2.3-1`.
   - Remove all the `bump version...` commits. E.g. by using `git rebase -i <hash-before-first-version-bump>` and `drop`-ing the commits. In this case we drop `chore(release): bump version to 1.2.3-0` and `chore(release): bump version to v.1.2.3-1`.
   - Run `./scripts/release.ts minor | patch`. This way, the version bump commits and changelog entries created by the pre-releases are omitted from the final history.
6. Go to our GitHub [Releases page](https://github.com/garden-io/garden/releases) and click the **Edit** button for the draft just created from CI. Note that for drafts, a new one is always created instead of replacing a previous one.
7. Write release notes. The notes should give an overview of the release and mention all relevant features. They should also **acknowledge all external contributors** and contain the changelog for that release.
   - Automated release notes generation:
     - Run `./scripts/draft-release-notes.ts <previous-tag> <current-tag>`, the filename with the draft notes will be printed in the console
     - Open the draft file (it's named `release-notes-${version}-draft.md`, e.g. `release-notes-0.12.38-draft.md`) and resolve all suggested TODO items
   - Old way of release notes generation (if the automated way fails for some reason):
     - To generate a changelog for just that tag, run `git-chglog <previous-release-tag-name>..<tag-name>`
     - To get a list of all contributors between releases, ordered by count, run: `./scripts/show-contributors.sh <previous-tag> <current-tag>`. Note that authors of squashed commits won't show up, so it might be good to do a quick sanity check on Github as well.
     - Take the previous release notes for GitHub as a template and apply the necessary updates.
     - Remember to put the list of features on top of the list of bug fixes in the changelog.
8. Click the **Publish release** button.
9. Make a pull request for the branch that was pushed by the script and make sure it's merged as soon as possible.
10. Make sure the `latest-release` branch contains the released version, and push it to the remote. **This branch is used for our documentation, so this step is important.**
11. Check the `update-homebrew` GitHub Action run successfully and merge the relevant PR in the [homebrew repo](https://github.com/garden-io/homebrew-garden/pulls).
12. Install the Homebrew package and make sure it works okay:
    - `brew tap garden-io/garden && brew install garden-cli || true && brew update && brew upgrade garden-cli`
    - Run `$(brew --prefix garden-cli)/bin/garden dev` (to make sure you're using the packaged release) in an example project and see if all looks well.
13. Prepare the release announcement and publish it in our channels (Discord and Twitter). If not possible, delegate the task to an available contributor.
