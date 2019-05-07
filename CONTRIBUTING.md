# Developing the Garden CLI framework

## Contributing guidelines

We heartily welcome any form of contribution to the project, including issue reports, feature requests,
discussion, pull requests and any type of feedback. We request that all contributors
adhere to the [Contributor Covenant](CODE_OF_CONDUCT.md) and work with us to make the collaboration and
community productive and fun for everyone :)

## Setting up your development environment

### Step 1: Install Docker and Kubernetes

Please refer to our [installation docs](./docs/basics/installation.md) for instructions on how to install Docker and Kubernetes for different platforms.

### Step 2: Clone the repo

    git clone https://github.com/garden-io/garden.git

### Step 3: Install dependencies

#### OSX

For Mac we have a script that installs all required dependencies.

If you haven't already, please [install Homebrew](https://docs.brew.sh/Installation). Then run:

    ./bin/bootstrap-osx

#### Windows / Linux

Other platforms need to roll their own for now (contributions welcome!). Please have a look at the script for OSX to see what's installed.

**Note:** We recommend using Node 10 when developing Garden.

### Step 4: Bootstrap project

Install Node modules for the root package, and the `dashboard` and `garden-service` packages:

    npm run bootstrap

## Developing Garden

### Initial build

Before running Garden for the first time, you need to do an initial build by running

```sh
npm run build
```

from the root directory. This ensures that the dashboard is built and ready to serve and that version files are in place.

### Developing

To develop the CLI, run the `dev` command in your console:

    cd garden-service
    npm run dev

This will `npm link` it to your global npm folder, and then watch for
changes and auto-rebuild as you code. You can then run the `garden` command as normal.

Also, you might like to add a couple of shorthands:

```sh
alias g='garden'
alias k='kubectl'
```

For developing the dashboard, please refer to the [dashboard docs](./dashboard/README.mdj).

### Debugging

**WARNING: This setup is broken on Node > 10.12 and latest versions of Chrome. See e.g. this [SO post](https://stackoverflow.com/questions/48994836/chrome-devtools-dedicated-node-js-inspector-not-stopping-at-breakpoints). The solutions suggested there have not worked.**

To enable setting a breakpoint in the code, run the CLI with the `garden-service/bin/static/garden-debug` binary, which adds the `--inspect` flag. Developers might find it useful to alias this:

```sh
alias gd='/path/to/garden/garden-service/bin/static/garden-debug'
```

You can e.g. use the Chrome DevTools to inspect the code at the breakpoint:

1. Add a `debugger` statement somewhere in the code.
2. Navigate to [chrome://inspect/](chrome://inspect/) in your Chrome browser.
3. Click the **Open dedicated DevTools for Node** link.
4. Run a CLI command that hits the breakpoint, e.g.:

```sh
garden-service/bin/static/garden-debug deploy # or gd deploy, if you've set the alias
```

You should now be able to inspect the code at run time in the **Console** tab of the DevTools window.

### Tests

Tests are run using `mocha` via `npm test` from the directory of the package you want to test. To run a specific test, you can grep the test description with the `-g` flag. E.g., to the test the `taskGraph` of the `garden-service`, run:

```sh
cd garden-service
npm test -- -g "taskGraph"
```

Integration tests are run with:


```sh
npm run integ
```

### Commit messages

We follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0-beta.4/#specification) and automatically validate the formatting of our commit messages. In particular, the **type** of the commit header must be one of the following:

* **chore**: Changes to the build process or auxiliary tools and libraries such as documentation
  generation.
* **ci**: Changes to the CI configuration.
* **docs**: Documentation only changes.
* **feat**: A new feature.
* **fix**: A bug fix.
* **improvement**: Changes that improve a current implementation without adding a new feature or fixing a bug.
* **perf**: A code change that improves performance.
* **refactor**: A code change that neither fixes a bug nor adds a feature.
* **revert**: A commit that reverts a previous commit. It should begin with `revert: `, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing
  semi-colons, etc).
* **test**: Adding missing or correcting existing tests.

When generating the changelog, we only include the following types: **feat**, **fix**, **refactor**, **improvement**, and **perf**. This means that any changes that the user should be aware of, should have one of these types.

### Checks

We have scripts for checking licenses, docs, linting and more. These can all be run with a single command:

```sh
npm run check-all
```

If the checks fail because of bad formatting, run:

```sh
npm run fix-format
```

If the checks fail because of missing docs, run:

```sh
npm run generate-docs
```

### Pre-push hook

Before pushing, we automatically run the `check-all` script from above, as well as unit and integration tests. To skip these, run push with the `--no-verify` flag:

```sh
git push origin <my-branch> --no-verify
```

## CI

We use [Circle CI](https://circleci.com) for integration testing. Sometimes
it can be useful to test and debug the CI build locally, particularly when
updating or adding dependencies. You can use their
[CLI](https://circleci.com/docs/2.0/local-jobs/) for that, which
is installed automatically by the `./bin/bootstrap-osx` script. Once you
have it installed you can run `circleci build` in the repo root to test
the build locally.

## License/copyright headers

Every source file must include the contents of `static/license-header.txt` at the top. This is
automatically checked during CI. You can run the check with `npm run check-licenses`.

## Release process

### Packages

Our release process generates the following packages:

* An executable for OSX, Linux, and Windows, generated by [Pkg](https://github.com/zeit/pkg) and hosted on our [Github page](https://github.com/garden-io/garden/releases).
* A [Homebrew](https://brew.sh/) package for OSX users.

### Process

The release process is twofold, first a [release script](https://github.com/garden-io/garden/blob/master/bin/release.ts) is run. The script has the signature: `./bin/release.tsx <minor | patch | preminor | prepatch | prerelease> [--force]` and does the following:
* Checks out a branch named `release-<version>`.
* Updates `package.json` and `package-lock.json` for `garden-service` and the changelog.
* Commits the changes, tags the commit and pushes the tag and branch, triggering a CI process the creates the release artifacts.

Second, we manually upload the artifacts generated in CI to our Github releases page and then write the release notes.

### Steps

To make a new release, set your current working directory to the garden root directory and follow the steps below.

1. The first step depends on the release type:
    * If you're making the first pre-release, run `./bin/release.tsx prerelease` from `master`.
    * If you’ve already created a prerelease, e.g. `v1.2.3-0`, and want to create a new prerelease `v1.2.3-1` which includes changes made on master since `v1.2.3-0` was created, do the following:
        * `git checkout v1.2.3-0`
        * `git rebase master`
        * `./bin/release.ts prerelease`
    * If you’re ready to make a proper release, run `./bin/release.ts minor | patch` from `master`. This way, the version bump commits created by the prereleases are omitted from the final history.
2. Open the [Garden project on CircleCI](https://circleci.com/gh/garden-io/garden) and browse to the job marked `release-service-pkg`. Open the **Artifacts** tab and download the listed artifacts.
3. Go to our Github [Releases tab](https://github.com/garden-io/garden/releases) and click the **Draft a new release** button.
4. Fill in the **Tag version** and **Release title** fields with the new release version (same as you used for the tag).
5. Upload the downloaded artifacts.
6. Write release notes (not necessary for RCs). The notes should give an overview of the release and mention all relevant features. They should also **acknowledge all external contributors** and contain the changelog for that release. (To generate a changelog for just that tag, run `git-chglog <tag-name>`.)
7. Click the **Publish release** button.
8. Make a pull request for the branch that was pushed by the script.
9. If you're making an RC, you're done! Otherwise, you need to update Homebrew package: `gulp update-brew`.

## Changelog

We keep a changelog under `CHANGELOG.md` that get's updated on every release. For pre-releases, we include every pre-release tag in that release cycle in the changelog. So if we're releasing, say, `v0.9.1-3`, the changelog will include entries for `v0.9.1-0`, `v0.9.1-1`, `v0.9.1-2`, assuming those tags exist. Once we make a proper release, we remove the pre-release tags so that the changelog only shows changes between `v0.9.0` and `v0.9.1`. A changelog with the pre-releases is of course always available in our Git history.
