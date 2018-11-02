[![CircleCI](https://circleci.com/gh/garden-io/garden/tree/master.svg?style=svg&circle-token=ac1ec9984d093f91e594e5a0a03b34cec2c2a093)](https://circleci.com/gh/garden-io/garden/tree/master)


![](./garden-banner-logotype-left-2.png)

*Welcome! Garden is a full-featured development framework for containers and serverless backends, designed to make
it easy to develop and test distributed systems.*
<br><br>

### Status

The project is in _early alpha_ (or developer preview, if you prefer). This means APIs may well change (not drastically, but still), overall stability will improve and support for remote environments is still limited.

All that said, Garden can already be highly useful if the following applies to you:

* **You're deploying to (or transitioning to) Kubernetes.**
* **You really don't want to spend your precious hours building your own developer tooling!**

If that sounds right for you, please give it a go and don't hesitate to report issues.


## Features

With Garden, you can...

* Configure and deploy a fleet of services to a local Kubernetes cluster using simple declarations.
* Use an integrated framework for building, testing and deploying services.
* Easily run end-to-end tests across multiple services without waiting for a slow CI pipeline.
* Automatically build, deploy and/or test when your code changes, using the `--watch` flag or the `garden dev` command.
* Manage build and runtime dependencies across all your services.
* Leverage a suite of commands and helpers to facilitate developing and running your stack.
* _Write code the way you want, and run your production system however suits you! Garden does not impose any new libraries or languages on your codebase aside from the config files._

Garden is also designed to be pluggable and modular, with Kubernetes being just one plugin (albeit an important one). Over time, we will add native support for a variety of platforms, including AWS (Lambda, ECS, Fargate and more), GCP, and Heroku, and the list will continue growing.


## Usage

Head over to our [Quick Start guide](./basics/quick-start.md), and then look through our [Simple Project](./examples/simple-project.md) guide to get a quick sense of how everything works.

For a more in-depth approach, just keep reading this documentation.

[![asciicast](https://asciinema.org/a/SKI7qe7DFVVHxvoaIVrLPb6Es.png)](https://asciinema.org/a/SKI7qe7DFVVHxvoaIVrLPb6Es?speed=2)

## Contributing

We welcome any and all contributions to Garden! What we're trying to achieve is a big task, and
developers have a lot of diverse needs, so we need and appreciate your input, whether it's through
code, docs, issues, or developing plugins to better support your particular technology stack.

For more detailed guidelines, see [CONTRIBUTING.md](../CONTRIBUTING.md).


# Motivation

The landscape of server-side development has changed immensely over the last decade.
This has partly been driven by evolving needs — **scalability has become table-stakes for most
projects and companies** — and also by the rapid development and proliferation of new technologies
like containers.

From an operations standpoint, all of this is fantastic. Scaling out is increasingly simple
and cost-effective, and managing production systems is easier than ever. So much so, that the
notion of DevOps has caught on — if ops is so easy, why not have the developers do it
themselves?

And the promise of it all is great. Microservices, immutable infrastructure, continuous
integration and deployment, all that jazz. Trouble is, all this tends to come at the expense
of application developer productivity. In embracing these new technologies and tools, we've
_over-optimized for ops, and in turn made it more difficult and tedious to work on the actual
application code_.

Now, rather than lament and pine for the good ol' monolith days, we at Garden feel that this can
be addressed by **a new generation of developer tooling**. So that's what we've set out to make.
It's certainly not a trivial task, but we truly believe that it's possible to not only reclaim the
rapid feedback loops we're used to when developing individual services, but to go further and
leverage the benefits of modern backend platforms to make development easier and faster than ever.

So think of Garden as the missing layer on top of Kubernetes, AWS, GCP, etc., that focuses purely
on the **developer experience**, makes it trivial to work across multiple platforms, and closes the
gap between infrastructure and application development.

We do this by frameworking around the basic primitives of development — building, testing,
debugging and deploying — and making the _how_ of each of those pluggable and configurable.
This allows the framework to grow with you and adapt as your needs evolve in terms of how you
architect and run your code in production, and allows us to easily tie together all the amazing
open-source tools that are being developed in the ecosystem, into an **integrated, consistent
and easy-to-use development framework**.
