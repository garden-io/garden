# Developing the Garden CLI framework

## Contributing guidelines

We heartily welcome any form of contribution to the project, including issue reports, feature requests,
discussion, pull requests and any type of feedback. We request that all contributors
adhere to the [Contributor Covenant](CODE_OF_CONDUCT.md) and work with us to make the collaboration and
community productive and fun for everyone :)

## Project structure

The project code is composed of several components, most of which are written in TypeScript. There's also a number of supporting scripts, documents, examples etc. Here is an overview of the top-level project folders:

| Name | Description |
| ---- | ----------- |
| `bin` | Executable commands, to use for development. _Note that you need to build the project before these work._ |
| `cli` | The Garden CLI package, which composes code from different packages into the final CLI executable. |
| `core` | The bulk of the Garden code and tests live here. |
| `dashboard` | The Garden web dashboard, which is bundled with the CLI. |
| `docs` | Markdown documentation, which is used to generate [docs.garden.io](https://docs.garden.io). _Note that the reference docs are auto-generated, and should not be edited by hand!._ |
| `examples` | Various Garden example projects. |
| `images` | Supporting container images, used by e.g. the `kubernetes` provider. |
| `plugins` | Plugins that are bundled with Garden. We are in the process of moving plugins out of `core` and into separate packages here. |
| `scripts` | Various scripts for builds, releases and development. |
| `sdk` | The `@garden-io/sdk` package, used for Garden plugin development. |
| `secrets` | Encrypted files, used for integ/e2e testing. Only accessible to Garden maintainers. |
| `static` | Static files that are bundled with the CLI. |
| `support` | Supporting files for development, builds, releases etc. |

## Setting up your development environment

### Step 1: Install Docker and Kubernetes

Please refer to our [installation docs](./docs/getting-started/1-installation.md) for instructions on how to install Docker and Kubernetes for different platforms.

### Step 2: Clone the repo

```sh
git clone https://github.com/garden-io/garden.git
```

### Step 3: Install dependencies

#### OSX

For Mac we have a script that installs all required dependencies.

If you haven't already, please [install Homebrew](https://docs.brew.sh/Installation). Then run:

```sh
./scripts/install-osx-dependencies.sh
```

#### Windows / Linux

Other platforms need to roll their own for now (contributions welcome!). Please have a look at the script for OSX to see what's installed.

**Note:** We recommend using Node 12 when developing Garden.

### Step 4: Bootstrap project

Install Node modules for the root package, and the `dashboard` and `core` packages:

```sh
yarn install # To install root dependencies
yarn run bootstrap # To bootstrap packages
```

from the root directory

You may need to install the Node modules in the core package manually due to [lerna/lerna#1457](https://github.com/lerna/lerna/issues/1457).

```sh
cd core
yarn
```

## Developing Garden

### Initial build

Before running Garden for the first time, you need to do an initial build by running

```sh
yarn build
```

from the root directory. This ensures that the dashboard is built and ready to serve and that version files are in place.

### Developing

To develop the CLI, run the `dev` command in your console:

```sh
yarn dev
```

This will link it to your global `node_modules` folder, and then watch for
changes and auto-rebuild as you code. You can then run the `garden` command as normal.

Also, you might like to add a couple of shorthands:

```sh
alias g='garden'
alias k='kubectl'
```

For developing the dashboard, please refer to the [dashboard docs](./dashboard/README.md).

### Formatting

We use [Prettier](https://prettier.io) for automated formatting. We highly recommend installing the appropriate plugin for your editor to automate formatting as you work on your code. You can also run `yarn run fix-format` to fix formatting across the codebase.

### Debugging

To enable setting a breakpoint in the code, run the CLI with the `bin/garden-debug` binary, which adds the `--inspect` flag. Developers might find it useful to alias this:

```sh
alias gd='/path/to/garden/bin/garden-debug'
```

You can e.g. use the Chrome DevTools to inspect the code at the breakpoint:

1. Add a `debugger` statement somewhere in the code.
2. Navigate to [chrome://inspect/](chrome://inspect/) in your Chrome browser.
3. Click the **Open dedicated DevTools for Node** link.
4. Run a CLI command that hits the breakpoint, e.g.:

```sh
/path/to/garden/bin/garden-debug deploy # or gd deploy, if you've set the alias
```

You should now be able to inspect the code at run time in the **Console** tab of the DevTools window.

### Tests

Unit tests are run using `mocha` via `yarn test` from the directory of the package you want to test. To run a specific test, you can grep the test description with the `-g` flag.:

```sh
cd core
yarn test                    # run all unit tests
yarn test -- -g "taskGraph"  # run only tests with descriptions matching "taskGraph"
```

#### ARM64 compatibility
On ARM64 platforms (like Mac machines with M1 chips) the `yarn test` command may fail with the following error:
```sh
FATAL ERROR: wasm code commit Allocation failed - process out of memory
```
In order to fix it, the terminal must be running in the **Rosetta** mode, the detailed instructions can be found in
[this SO answer](https://stackoverflow.com/a/67813764/2753863).

Integration tests are run with:

```sh
yarn integ-local
```

End-to-end tests are run with:

```sh
yarn run e2e
```

You can also run the end-to-end tests for a specific example project using:

```sh
yarn run e2e-project -- --project=<example project name>
```

End-to-end tests are run in CI by using Garden itself to test the project defined in `./core/test/e2e/garden.yml`. Cf. the appropriate job in `circleci/config.yml` for details.

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
yarn run check-all
```

If the checks fail because of bad formatting, run:

```sh
yarn run fix-format
```

If the checks fail because of missing docs, run:

```sh
yarn run generate-docs
```

### Pre-push hook

Before pushing, we automatically run the `check-pre-push` script (which runs the scripts in `check-all`, except for
`check-docs`), as well as unit tests. To skip these, run push with the `--no-verify` flag:

```sh
git push origin <my-branch> --no-verify
```

### Environment Variables

You should set the following environment variables when developing on Garden:

```sh
GARDEN_DISABLE_ANALYTICS=true
GARDEN_DISABLE_VERSION_CHECK=true
ANALYTICS_DEV=true
```

## CI

We use [Circle CI](https://circleci.com) for integration and end-to-end testing. The configuration is in `.circleci/config.yml`.

## License/copyright headers

Every source file must include the contents of `support/license-header.txt` at the top. This is
automatically checked during CI. You can run the check with `yarn run check-licenses`.

## Release process

### Packages

Our release process generates the following packages:

* An executable for OSX, Linux, and Windows, generated by [Pkg](https://github.com/vercel/pkg) and hosted on our [Github page](https://github.com/garden-io/garden/releases).
* A [Homebrew](https://brew.sh/) package for OSX users.

### Process

Check out our [release process guide](./RELEASE_PROCESS.md) for more details.

## Changelog

We keep a changelog under [CHANGELOG.md](./CHANGELOG.md) that gets updated on every release. For pre-releases, we include every pre-release tag in that release cycle in the changelog. So if we're releasing, say, `0.12.6-3`, the changelog will include entries for `0.12.6-0`, `0.12.6-1`, `0.12.6-2`, assuming those tags exist. Once we make a proper release, we remove the pre-release tags so that the changelog only shows changes between `0.12.5` and `0.12.6`. A changelog with the pre-releases is of course always available in our Git history.
