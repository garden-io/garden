# How Garden works

The mechanics for how Garden works are fundamentally straight forward:

The main functionality is housed under what we call providers. We have, for example, a provider for containers, one for OpenFaaS, one for Kubernetes, and providers are how we control the behavior of these different types of tools.

Garden projects, in turn, consist of modules. Each module in a project has a type (e.g. container, OpenFaaS), and the type then indicates which provider should deal with each specific module when it comes to building, deploying, and testing it.

This information is conveyed through [configuration files](./using-garden/configuration-files.md), usually in YAML format, which live in the project root for project-wide settings, and in each module's directory (for module-specific settings).

# Projects vs. modules vs. services

Garden has three main organizational units: projects, modules, and services.

A project is the largest unit, and it contains all the others. You can think of a project as a context: there aren't any hard rules or limitations as to how big or small your project should be, but it's advisable to keep all elements belonging to a same context inside the same project.

Modules can be thought of as build units. So, for example, every container and every serverless function should, as a rule of thumb, have its own module.

Lastly, services are units of deployment, or instances. They're *usually* one per module, but not necessarily: you might have, for example, two instances of the same container working on different queues or data streams.

To sum it all up: A project consists of one or modules, and each module may deploy zero or more services.

# The build → test → deploy sequence

One of the main tools of Garden to make the development of distributed systems extremely agile is the developer framework. You can call with `garden dev`.

It is a combination of the `build`, `deploy` and `test` commands, that is, it builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests as you modify the code.

The `build`, `deploy` and `test` commands, and by extension the `dev` command, are all dependency-aware. They will always build, test, and deploy modules in the right order so that all dependencies are respected.

# How inter-service communication works

Arguably the most important thing a distributed system needs to do is to allow its different parts to talk to one another. Garden makes inter-service communication extremely simple: a service's hostname is simply its name as declared in the configuration file.

For example, if you have a service called `my-service`, you can access its `/feature` endpoint by simply calling `http://my-service/feature`.

# Hot reload

Hot reloading is updating a running service when its source files are changed, without re-building and re-deploying the whole thing. 

In the case of a container, for example, we would not destroy the container, change the files, and then re-deploy a new container. Instead, we would update the changed files without stopping the running container, thus potentially not losing the current state of the application.

Hot reload is off for all modules by default, and it needs to be enabled with the `hotReload` field a module's configuration file. For more detailed information, see the [configuring hot reload](./guides/configuring-hot-reload.md) guide.

# Projects with multiple and/or remote repositories

Garden projects may include sources hosted in any number of local or remote repositories. Remote sources may be later linked to local directories for convenience or to work offline. 

You could have, for example, a project that has one local module, then one remote module from an external source, and then a second external source that contains, let's say, two more modules.

For specifics see our [projects with multiple remote and local repos](./guides/multiple-and-remote-repos.md) guide.