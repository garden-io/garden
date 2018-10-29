# How Garden works

The mechanics of how Garden works are fundamentally straightforward:

*Providers* implement the specifics of how to e.g. build, deploy or test a given type of module. For example, Garden includes providers for local Kubernetes, remote Kubernetes and OpenFAAS serverless functions.

Garden projects, in turn, consist of *modules*. Each module in a project has a type (e.g. container, OpenFaaS), and the type then indicates which provider should deal with a given module when it comes to building, deploying, and testing it.

This information is conveyed through [configuration files](../using-garden/configuration-files.md), usually in YAML format, which live in the project root for project-wide settings, and in each module's directory for module-specific settings.

# Projects vs. modules vs. services

Garden has three main organizational units: projects, modules, and services.

A project is the top-level unit, and it contains all the others. You can think of a project as a context: there aren't any hard rules or limitations as to how big or small your project should be, but it's advisable to keep all elements belonging to the same context inside the same project.

Modules can be thought of as the individual units of the build process. So, for example, every container and every serverless function should, as a rule of thumb, have its own module.

Lastly, services are units of deployment, or instances. They're *usually* one service per module, but not necessarily: you might have, for example, two instances of the same container working on different queues or data streams.

To sum it all up: A project consists of one or more modules, and each module may deploy zero or more services.

# The build → test → deploy sequence

The dev command (called with garden dev) combines the `build`, `deploy` and `test` commands, and is a convenient way to get your development environment up and running: It builds, deploys and tests your modules and services as needed when their source code changes.

The `build`, `deploy` and `test` commands, and by extension the `dev` command, are all dependency-aware. They will always build, test, and deploy modules in the right order so that all dependencies are respected.

# Hot reload

Hot reloading means updating a running service when its source files are changed, without re-building and re-deploying the whole thing. 

In the case of a container, for example, we would not destroy the container, build a new version, and then re-deploy. Instead, we would update the changed files without stopping the running container, updating the running application more quickly.

Hot reloading is disabled by default. To enable hot reloading for a set of services, use the `--hot-reload` option with the names of those services when calling the deploy or dev commands.

# Projects with multiple and/or remote repositories

Garden projects may include sources hosted in any number of local or remote repositories. Remote sources may later be linked to local directories for convenience or to work offline. 

You could have, for example, a project that has one local module, one remote module from an external source, and a second external source that contains two more modules.

For specifics see our [Remote sources project](../examples/remote-sources.md) example.