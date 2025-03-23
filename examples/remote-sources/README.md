# Remote sources example project

This example demonstrates how you can import remote sources into a Garden project.
Take a look at the [Using Remote Sources](../../docs/features/remote-sources.md) section of our docs for more details.

## About

This project is the same as the [vote example](../vote/README.md) — except that in this case the services live in their own repositories. The repositories are:

* [Database services](https://github.com/garden-io/garden-example-remote-sources-db-services) (contains the Postgres and Redis services)
* [Web services](https://github.com/garden-io/garden-example-remote-sources-web-services) (contains the Python Vote web service, Node.js Result web service and the api)
* [Java worker action](https://github.com/garden-io/garden-example-remote-module-jworker)

_This split is pretty arbitrary and doesn't necessarily reflect how you would normally separate services into different repositories._

## Usage

This project doesn't require any setup and can be deployed right away. If this is your first time working with this project, Garden will start by fetching the remote source code:
```sh
garden deploy
```
Garden will continue to use the version originally downloaded. Use the `update-remote` command to fetch the latest version of your remote sources:
```sh
garden update-remote all
```
If you change the repository URL of your remote source (e.g. switch to a different tag or branch), Garden will automatically fetch the correct version.

It's also possible to link remote sources to a local directory with the `link` command. This is useful for when you want to try out changes to the remote source without having to push them to the remote repository. In this case, you clone the remote source to a local directory and link to its path:
```sh
garden link source web-services path/to/web-services
```
Now Garden will read the sources from their local path, and changes you make will be visible immediately.

Use the `unlink` command to unlink it again, and revert to the version the repository URL points to:
```sh
garden unlink source web-services
```
