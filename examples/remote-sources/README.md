# Remote sources example project

This example demonstrates how you can import remote sources and remote modules into a Garden project. Take a look at the [Using Remote Sources](https://docs.garden.io/using-garden) section of our docs for more details.

## About

This project is the same as the [vote example](https://github.com/garden-io/garden/tree/v0.9.0-docfix.2/examples/vote)—except that in this case the services live in their own repositories. The repositories are:

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
