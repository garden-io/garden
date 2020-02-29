# Remote Sources

You can import **two** types of remote repositories with Garden:

> **Remote _source_**: A repository that contains one or more Garden modules _and_ their corresponding `garden.yml` config files.

> **Remote _module_**: The source code for a single Garden module. In this case, the `garden.yml` config file is stored in the main project repository while the module code itself is in the remote repository.

The code examples below are from our [remote sources example](https://github.com/garden-io/garden/tree/v0.11.5/examples/remote-sources).

## Importing Remote Repositories

### Remote Sources

You can import remote sources via the `sources` directive in the project level `garden.yml` like so:

```yaml
# examples/remote-sources/garden.yml
kind: Project
name: remote-sources
sources:
  - name: web-services
    repositoryUrl: https://github.com/garden-io/garden-example-remote-sources-web-services.git#v0.1.0
  - name: db-services
    repositoryUrl: https://github.com/garden-io/garden-example-remote-sources-db-services.git#v0.1.0
```

Note that the URL must point to a specific branch or tag.

Use this when you want to import Garden modules from another repository. The repository can contain one or more modules along with their `garden.yml` config files. For example, this is the file tree for the remote `web-services` source:

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

If you now run `garden get status` you will see all the services from the two remote repositories (`vote` and `result` from the [web-services repo](https://github.com/garden-io/garden-example-remote-sources-web-services) and `db` and `redis` from the [db-services repo](https://github.com/garden-io/garden-example-remote-sources-db-services)):

```sh
services:
  vote:
    version: v-201abc4d2e
    ...
  result:
    version: v-c36f4f09d0
    ...
  redis:
    version: v-e5c48b9089
    ...
  db:
    version: v-7bca8577d2
    ...
```

### Remote Modules

You can import the source code for a _single_ Garden module from another repository via the `repositoryUrl` directive in the module level `garden.yml` like so:

```yaml
# examples/remote-sources/jworker/garden.yml
kind: Module
description: Java Worker
type: container
name: jworker
repositoryUrl: https://github.com/garden-io/garden-example-remote-module-jworker.git#v0.1.0
services:
  - name: jworker
  ...
```

As with remote sources, the URL must point to a specific branch or tag.

Use this when you want to configure the module within your main project but import the source from another repository. In this case, the module in the main project simply looks like this:

```sh
# examples/remote-sources
$ tree .

.
├── garden.yml
└── jworker
    └── garden.yml
```

Notice that it only contains the `garden.yml` file, all the source code is in the [`garden-example-remote-module-jworker`](https://github.com/garden-io/garden-example-remote-module-jworker/) repository. If the remote module also contains a `garden.yml` file it is ignored.

### Local Sources/Modules

You can also import sources and modules from your local file system by setting the `repositoryUrl` to a local file path:

```yaml
repositoryUrl: file:///my/local/project/path#master
```

As usual, the URL must point to a specific branch or tag.

Local paths work just the same remote URLs and you'll still need to [link the repository](#linking-remote-sourcesmodules-to-local-code) if you want to edit it locally.

In general we don't recommend using local paths except for testing purposes. The `garden.yml` files should be checked into your version control system and therefore shouldn't contain anything specific to a particular user's setup.

## Linking Remote Sources/Modules to Local Code

If you have a local copy of your external source and want to be able to work on it and make changes, you can use the `link module|source` command. To link the `web-services` source from above, you would run:

```console
garden link source web-services /local/path/to/web-services
```

Now you can edit the local version of the `web-services` repository and it will work just the same as when you edit the main project. For example, if you run Garden in watch mode in the main project and update the local version of `web-services`, you'll see Garden pick up the changes and re-build and re-deploy the services from `web-services` repository.

To unlink a remote source or module, simply run `garden unlink source|module <name-of-source>`. For example:

```console
garden unlink source web-services
```

## Updating Remote Sources

Garden will only update a remote source if explicitly asked to do so via the `update-remote sources|modules` command.

For example, if we had pointed the repository URL of the `web-services` source from above to something like a `master` branch, and we now wanted to pull the latest code from the remote, we would run:

```console
garden update-remote source web-services
```

To update all remote sources and modules, you can run:

```console
garden update-remote all
```

## How it Works

Garden git clones the remote repositories to the `.garden/sources/projects` and `./garden/sources/modules` directories.

Repositories in `.garden/sources/projects` are handled like any other directory in the main project. They're scanned for `garden.yml` files and the modules found are synced to the `.garden/build` directory.

In the case of remote modules, Garden first finds the module `garden.yml` file in the main project and then knows to looks for the source code for that module under `./garden/sources/modules`. As for other modules, the code gets synced to the `./garden/build` directory.

Linked sources and modules are handled similarly except Garden uses the local path instead of the `./garden/sources` paths. Additionally, Garden watches the local paths when in watch mode.

Garden keeps track of the repository URL so that it can remove stale sources from the `.garden/sources` directory if the URL changes.
