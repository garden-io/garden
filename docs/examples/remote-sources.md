# Remote sources example project

This example demonstrates how you can import remote sources and remote modules into a Garden project.

_Note: To use multiple local repositories—not remote, as this article describes—simply utilize `file:///my/other/project/path` in the `repositoryUrl` field described below._

Important concepts:

> Remote _source_: A collection of one or more Garden modules that live in a repository different from the main project repository. The `garden.yml` config files are co-located with the modules in the remote repository.

> Remote _module_: The remote source code for a single Garden module. In this case, the `garden.yml` config file is stored in the main project repository while the module code itself is in the remote repository.

_Note: The source code for this project can be found at: [https://github.com/garden-io/garden/tree/v0.9.11/examples/remote-sources](https://github.com/garden-io/garden/tree/v0.9.11/examples/remote-sources)._

## About

This project is the same as the [vote example](https://github.com/garden-io/garden/tree/v0.9.11/examples/vote)—except that in this case the services live in their own repositories. The repositories are:

* [Database services](https://github.com/garden-io/garden-example-remote-sources-db-services) (contains the Postgres and Redis services)
* [Web services](https://github.com/garden-io/garden-example-remote-sources-web-services) (contains the Python Vote web service and the Node.js Result web service)
* [Java worker module](https://github.com/garden-io/garden-example-remote-module-jworker)

_This split is pretty arbitrary and doesn't necessarily reflect how you would normally separate services into different repositories._

## Usage

This project doesn't require any setup and can be deployed right away. If this is your first time working with this project, Garden will start by fetching the remote source code:
```sh
garden deploy
```
Garden will continue to use the version originally downloaded. Use the `update-remote sources|modules|all` command to fetch the latest version of your remote sources and modules:
```sh
garden update-remote modules jworker
```
If you however change the repository URL of your remote source or module (e.g. switch to a different tag or branch), Garden will automatically fetch the correct version.

It's also possible to link remote sources and modules to a local directory with the `link source|module` command. This is useful for when you want to try out changes to the remote source without having to push them to the remote repository. In this case, you clone the remote source to a local directory and link to its path:
```sh
garden link source web-services path/to/web-services
```
Now Garden will read the module from its local path, and changes you make will be visible immediately.

Use the `unlink source|module` command to unlink it again, and revert to the module version the repository URL points to:
```sh
garden unlink source web-services
```

## Further reading

### Project structure

Looking at the project structure, you'll notice that the project doesn't contain any code outside the `garden.yml` config files. Rather, the config files themselves contain the URLs to the remote repositories.

```sh
tree
.
├── README.md
├── garden.yml
└── services
    └── jworker
        └── garden.yml

2 directories, 3 files
```

### Configuring remote sources

For this project, we want to import the database and web services as remote _sources_. This means that the entire source code gets embedded into the project and treated just like our other project files. As usual, Garden will scan the project for `garden.yml` files, and include all modules it finds.

To import remote sources, we add them under the `sources` key in the top-level project configuration file:

```yaml
kind: Project
name: remote-sources
sources:
  - name: web-services
    repositoryUrl: https://github.com/garden-io/garden-example-remote-sources-web-services.git#v0.1.0
  - name: db-services
    repositoryUrl: https://github.com/garden-io/garden-example-remote-sources-db-services.git#v0.1.0
```

> Remote repository URLs must contain a hash part that references a specific branch or tag, e.g. `https://github.com/org/repo.git/#my-tag-or-branch`. The remote repositories used in this example all contain the tag `v0.1.0`. Read more about Git tagging [here](https://git-scm.com/book/en/v2/Git-Basics-Tagging).

### Configuring remote modules

Additionally, we want to import the Java worker as a remote _module_. In that case, Garden assumes that the remote repository contains the source code for a single Garden module. Furthermore, the `garden.yml` config file for that module is kept in the main project repo:
```sh
tree services
services
└── jworker
    └── garden.yml

1 directory, 1 file
```
and the path to the repository URL is added under the `repositoryUrl` key like so:
```yaml
kind: Module
description: worker
type: container
name: jworker
repositoryUrl: https://github.com/garden-io/garden-example-remote-module-jworker.git#v0.1.0
services:
  - name: javaworker
    dependencies:
      - redis
```

Note that a project can contain its own modules and also import remote sources and modules.