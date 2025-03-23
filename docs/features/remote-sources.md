---
order: 80
title: Remote Sources
---

# Remote Sources

You can import **two** types of remote repositories with Garden:

> **Remote _source_**: A repository that contains one or more Garden modules or actions _and_ their corresponding `garden.yml` config files.

> **Remote _actions_**: The source code for a single Garden action. In this case, the `garden.yml` config file is stored in the main project repository while the action code itself is in the remote repository.

The code examples below are from our [remote sources example](../../examples/remote-sources/README.md).

## Importing Remote Repositories

### Remote Sources

You can import remote sources via the `sources` directive in the project-level `garden.yml` like so:

```yaml
# examples/remote-sources/garden.yml
apiVersion: garden.io/v1
kind: Project
name: remote-sources
sources:
  - name: web-services
    repositoryUrl: https://github.com/garden-io/garden-example-remote-sources-web-services.git
  - name: db-services
    # use #your-branch to specify a branch, #v0.3.0 for a tag or a full length commit SHA1
    repositoryUrl: https://github.com/garden-io/garden-example-remote-sources-db-services.git#main
```

Note that the URL must point to a specific branch, tag or commit hash.

Use this when you want to import Garden actions from another repository. The repository can contain one or more actions along with their `garden.yml` config files. For example, this is the file tree for the remote `web-services` source:

```sh
# From the root of the garden-example-remote-sources-web-services repository
$ tree .

.
├── README.md
├── result
│   ├── Dockerfile
│   ├── garden.yml
│   └── ...
└── vote
    ├── Dockerfile
    ├── garden.yml
    └── ...
```

You can imagine that this file tree gets merged into the parent project.

If you now run `garden get tests` you will see all the test actions from the remote repositories.

```sh
api-integ
  type: container
  dependencies:
    • Deploy.api
    • Build.api

results-integ
  type: container
  dependencies:
    • Run.db-init
    • Build.result

vote-integ
  type: container
  dependencies:
    • Deploy.vote
    • Build.vote

vote-unit
  type: container
  dependencies:
    • Build.vote
```

### Remote Actions

You can import the source code for a _single_ Garden action from another repository via the `source.repository.url` directive in the root-level `garden.yml` like so:

```yaml
# examples/remote-sources/worker/garden.yml
kind: Build
type: container
name: worker
source:
  repository:
    url: https://github.com/garden-io/garden-example-remote-module-jworker.git#0.13
...
```

You can use the `source.path` option together with the `source.repository` option to override the directory inside the git repository.

As with remote sources, the URL must point to a specific branch or tag.

Use this when you want to configure the action within your main project but import the source from another repository.
In this case, the action in the main project looks like this:

```sh
# examples/remote-sources
$ tree .

.
├── garden.yml
└── worker
    └── garden.yml
```

Notice that it only contains the `garden.yml` file, all the source code is in the [`garden-example-remote-module-jworker`](https://github.com/garden-io/garden-example-remote-module-jworker/) repository. If the remote action also contains a `garden.yml` file it is ignored.

### Local Sources/Actions

You can also import sources from your local file system by setting the `repositoryUrl` or `source.repository.url` to a local file path:

```yaml
# project configuration (remote source)
sources:
  - name: web-services
    repositoryUrl: file:///my/local/project/path#main
```

```yml
# action configuration (remote action)
source:
  repository:
    url: file:///my/local/project/path#main
```

The URL must point to a specific branch or tag.

Local paths work just the same as remote URLs and you'll still need to [link the repository](#linking-remote-sourcesmodules-to-local-code) if you want to edit it locally.

In general we don't recommend using local paths except for testing purposes. The `garden.yml` files should be checked into your version control system and therefore shouldn't contain anything specific to a particular user's setup.

## Linking Remote Sources/Modules to Local Code

If you have a local copy of your external source and want to be able to work on it and make changes, you can use the `link` command. To link the `web-services` source from above, you would run:

```console
garden link source web-services /local/path/to/web-services
```

Now you can edit the local version of the `web-services` repository and it will work just the same as when you edit the main project.

To unlink a remote source use the `unlink` command. For example:

```console
garden unlink source web-services
```

## Updating Remote Sources

Garden will only update a remote source if explicitly asked to do so via the `update-remote` command.

For example, if we had pointed the repository URL of the `web-services` source from above to something like a `main` branch, and we now wanted to pull the latest code from the remote, we would run:

```console
garden update-remote source web-services
```

To update all remote sources and modules, you can run:

```console
garden update-remote all
```

## How it Works

Garden git clones the remote repositories to the `.garden/sources/` directory.

Repositories in `.garden/sources/projects` are handled like any other directory in the main project. They're scanned for `garden.yml` files and the definitions found are synced to the `.garden/build` directory.

In the case of remote actions, Garden first finds the action `garden.yml` file in the main project and then knows to looks for the source code for that action under `./garden/sources/actions`. For builds the code is also synced to the `./garden/build` directory.

Linked sources and actions are handled similarly except Garden uses the local path instead of the `./garden/sources` paths. Additionally, Garden watches the local paths when in watch mode.

Garden keeps track of the repository URL so that it can remove stale sources from the `.garden/sources` directory if the URL changes.
