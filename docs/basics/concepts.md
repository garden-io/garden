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

# How inter-service communication works



# Hot reload

# Projects with multiple and/or remote repositories
