[![CircleCI](https://circleci.com/gh/garden-io/garden/tree/master.svg?style=svg&circle-token=ac1ec9984d093f91e594e5a0a03b34cec2c2a093)](https://circleci.com/gh/garden-io/garden/tree/master)
 

![](docs/garden-banner-logotype-left-2.png)

*Welcome! Garden is a full-featured development framework for containers and serverless backends, designed to make 
it easy to develop and test distributed systems.* 
<br><br>

### Status

The project is in _early alpha_ (or developer preview, if you prefer). This means APIs may well change (not drastically,
but still), overall stability will improve and platform support is still limited.

All that said, Garden can already be highly useful if the following applies to you:

* **You're deploying to (or transitioning to) Kubernetes.**
* **You develop on Mac or Linux.**
* **You work mostly with containers** _**today**_ _\(but perhaps plan on adopting serverless platforms in the future\)._
* **You keep all your services in a single repository** _(multi-repo support coming soon!)._
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
* _Write code the way you want, and run your production system however suits you! Garden does not impose any new 
libraries or languages aside from the config files._ 

Garden is also designed to be pluggable and modular, with Kubernetes being just one plugin (albeit an important one). 
Over time we will add native support for a variety of platforms, including AWS (Lambda, ECS, Fargate and more), 
GCP, Heroku, OpenFaaS... and the list will continue growing.

Please read the [Motivation](https://docs.garden.io/introduction/motivation) section in our documentation
for a brief discussion on why we're building Garden.


## Usage

Head over to our [Getting Started guide](https://docs.garden.io/introduction/getting-started) for details
on how to set up and use Garden, or look through our [Simple Project](https://docs.garden.io/examples/simple-project)
guide to get a quick sense of how it works.


## Contributing

We welcome any and all contributions to Garden! What we're trying to achieve is a big task, and 
developers have a lot of diverse needs, so we need and appreciate your input, whether it's through 
code, docs, issues or developing plugins for your needs.

For more detailed guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).


## License

[Mozilla Public License 2.0 (MPL-2.0)](LICENSE.md)
