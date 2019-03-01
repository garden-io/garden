# Developing the Garden CLI framework

## Contributing guidelines

We heartily welcome any form of contribution to the project, including issue reports, feature requests,
discussion, pull requests and any type of feedback. We request that all contributors
adhere to the [Contributor Covenant](CODE_OF_CONDUCT.md) and work with us to make the collaboration and
community productive and fun for everyone :)

## Commit messages

We follow and automatically validate
[Angular-like formatting](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits) for our
commit messages, for consistency and clarity. In particular, the **type** of the commit header must be one of the following:

* **feat**: A new feature
* **fix**: A bug fix
* **docs**: Documentation only changes
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing
  semi-colons, etc)
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **perf**: A code change that improves performance
* **test**: Adding missing or correcting existing tests
* **chore**: Changes to the build process or auxiliary tools and libraries such as documentation
  generation

When generating the changelog, we only include the following types: **feat**, **fix**, **refactor**, and **perf**. This means that any changes that the user should be aware of, should have one of these types.

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

### Checks

We have scripts for checking licenses, docs, linting and more. These can all be run with a single command:

```sh
npm run check-all
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

Our release process generates the following packages:

* An executable for OSX, Linux, and Windows, generated by [Pkg](https://github.com/zeit/pkg) and hosted on our [Github page](https://github.com/garden-io/garden/releases).
* A [Homebrew](https://brew.sh/) package for OSX users.

To make a new release, set your current working directory to the garden root directory and follow the steps below.

1. Run the release script: `./bin/release.tsx <minor | patch | preminor | prepatch | prerelease> [--force]`. The script does the following:
    * Checks out a branch named `release-<version>`.
    * Updates `package.json` and `package-lock.json` for `garden-service` and the changelog.
    * Commits the changes, tags the commit and pushes the tag, triggering a CI process the creates the release artifacts.
2. Open the [Garden project on CircleCI](https://circleci.com/gh/garden-io/garden) and browse to the job marked `release-service-pkg`. Open the **Artifacts** tab and download the listed artifacts.
3. Go to our Github [Releases tab](https://github.com/garden-io/garden/releases) and click the **Draft a new release** button.
4. Fill in the **Tag version** and **Release title** fields with the new release version (same as you used for the tag).
5. Upload the downloaded artifacts.
6. Write release notes (not necessary for RCs). The notes should _at least_ contain the changelog. To generate a changelog for just that tag, run `git-chglog <tag-name>`.
7. Click the **Publish release** button.
8. Push the branch and make a pull request.
9. If you're making an RC, you're done! Otherwise, you need to update Homebrew package: `gulp update-brew`.

## Changelog

We keep a changelog under `CHANGELOG.md` that get's updated on every release. For pre-releases, we include every pre-release tag in that release cycle in the changelog. So if we're releasing, say, `v0.9.1-3`, the changelog will include entries for `v0.9.1-0`, `v0.9.1-1`, `v0.9.1-2`, assuming those tags exist. Once we make a proper release, we remove the pre-release tags so that the changelog only shows changes between `v0.9.0` and `v0.9.1`. A changelog with the pre-releases is of course always available in our Git history.
