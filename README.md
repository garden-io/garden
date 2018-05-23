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
* **You work mostly with containers _today_ (but perhaps plan on adopting serverless platforms in the future).**
* **You really don't want to spend your precious hours building your own developer tooling!**

If that sounds right for you, please give it a go and don't hesitate to report issues or come right over 
to our [Gitter](https://gitter.im/garden-io/Lobby#) for a chat!


## Setup

### Dependencies

You need to set up the following on your local machine to use garden:
* Node.js >= 8.x
* Docker
* Git
* rsync
* [Watchman](https://facebook.github.io/watchman/docs/install.html)
* Local installation of Kubernetes

To install Kubernetes, we recommend [Docker for Mac/Windows (edge version)](https://docs.docker.com/engine/installation/) 
on Mac/Windows, and you can use [Minikube](https://github.com/kubernetes/minikube) on any supported platform.
You'll just need to configure a [kubectl context](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-context-and-configuration)
to point to your local instance.

<!--- TODO: explain kubectl contexts somewhere in more detail --->

On Mac, we recommend using Homebrew on Mac to install everything except Docker, but use whatever works for you! 

Note that you need to install the _edge version_ of Docker for Mac/Windows in 
order to enable Kubernetes support. Once installed, you need to open the 
Docker preferences, go to the Kubernetes section, tick `Enable Kubernetes` and 
save. For more information, see [here for Mac](https://docs.docker.com/docker-for-mac/kubernetes/)
or [here for Windows](https://docs.docker.com/docker-for-windows/kubernetes/).

### Installation

Once you have the above dependencies set up, simply run

    npm install -g garden-cli

Then go on to our [getting started guide](docs/getting-started.md), or try out the simple hello-world 
example below to kick things off.


## Examples

The `examples/` directory contains usage examples for the framework. You might want to start with
the `hello-world` example project, to see an example of basic build, deployment and interaction
flows. Take a look around the projects, taking special note of the `garden.yml` files - 
it's pretty straightforward, we promise :)

To spin it up, `cd` to any of the directories under `examples/` and run:

    garden deploy
    
Once you've deployed the `hello-world` project, you can try querying the `/hello` endpoint:

    garden call hello-container/hello
    
For more details, please head over to our [getting started guide](docs/getting-started.md).


## Contributing

We welcome any and all contributions to Garden! What we're trying to achieve is a big task, and 
developers have a lot of diverse needs, so we need and appreciate your input, whether it's through 
code, docs, issues or developing plugins for your needs.

For more detailed guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).


## License

[Mozilla Public License 2.0 (MPL-2.0)](LICENSE.md)
