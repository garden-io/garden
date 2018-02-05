[![CircleCI](https://circleci.com/gh/garden-io/garden/tree/master.svg?style=svg&circle-token=ac1ec9984d093f91e594e5a0a03b34cec2c2a093)](https://circleci.com/gh/garden-io/garden/tree/master)

# garden

Just getting started now... More docs to follow.

## Setup

### Dependencies

You need to set up the following on your local machine to use garden:
* Node.js >= 8.x
* Git
* [Docker for Mac/Windows (edge version)](https://docs.docker.com/engine/installation/)

We recommend using Homebrew on Mac for everything except Docker. 

Note that you need to install the _edge version_ of Docker for Mac/Windows in 
order to enable Kubernetes support. Once installed, you need to open the 
Docker preferences, go to the Kubernetes section, tick `Enable Kubernetes` and 
save. For more information, see [here for Mac](https://docs.docker.com/docker-for-mac/kubernetes/)
or [here for Windows](https://docs.docker.com/docker-for-windows/kubernetes/).

### Installation

TODO


## Examples

The `examples/` directory contains usage examples for the framework. You might want to start with
the `hello-world` example project, to see an example of basic build, deployment and interaction
flows. Take a look around the projects, taking special note of the `garden*.yml` files - 
it's pretty straightforward, promise :)

To spin it up, `cd` to any of the directories under `examples/` and run:

    garden env configure local
    garden deploy local
    
If you've deployed the `hello-world` project, you can try querying the `/hello` endpoint:

    curl http://localhost:32000/hello -H 'Host: helloworld.my.garden'


## Developing the framework

### Setting up your environment

    ./bin/bootstrap-osx
    npm install
    
### Running a development version

Set an alias in your shell to the `bin/garden` executable in your project. For example for zsh:

    alias garden='~/my-code/garden/build/bin
    
Then to keep the build up to date, you can keep an open shell with the compiler running 
and watching for changes:

    npm run watch
    
Also, you might like to add a couple of shorthands:

    alias g='garden'
    alias k='kubectl'
    


### Testing

    npm test
  
#### CI

We use [Circle CI](https://circleci.com) for integration testing. Sometimes
it can be useful to test and debug the CI build locally, particularly when 
updating or adding dependencies. You can use their 
[CLI](https://circleci.com/docs/2.0/local-jobs/) for that, which
is installed automatically by the `./bin/bootstrap-osx` script. Once you
have it installed you can run `circleci build` in the repo root to test 
the build locally.
