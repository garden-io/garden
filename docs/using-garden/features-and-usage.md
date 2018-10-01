# Features and Usage

Now that you've had a glimpse at how to use Garden on the [Quick Start](./basics/quick-start.md) guide, and a brief look at the main [Concepts](./basics/concepts.md) we'll be dealing with, let's go through what the typical usage of Garden looks like.

## Starting a new project

There are two options:

- garden create
- creating config files by hand

### garden create

garden create project

add module, with module name and type for each

for existing, garden create module, type

ADD ISSUE for dynamic scaffolding for plugins

garden create project --module-dirs=./services



For more info on "gardenifying" an existing project, check out the [How to "gardenify" an existing project](./guides/how-to-gardenify.md) article.

## The development workflow

- garden dev
- normal development (?)
- inter-service communication
- error logs

you might wanna do garden logs my-service,my-service

if you don't update your tetss as you update your code, it's gonna fail

garden deploy watch to not have tests running all the time

## Providers

pick the right one for the job

the ones available are listed here

## Testing and dependencies

- writing tests
- integrating your tests with garden
- dependencies
- build, test, and deploy order

## Moving to production

[Remote Kubernetes](./using-garden/remote-kubernetes.md)

## Advanced features

[Configuring hot reload](./guides/configuring-hot-reload.md)
[Setting up TLS](./guides/setting-up-tls.md)
[Projects with multiple remote and local repos](./guides/multiple-and-remote-repos.md)
