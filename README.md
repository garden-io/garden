[![CircleCI](https://circleci.com/gh/garden-io/garden/tree/master.svg?style=svg&circle-token=ac1ec9984d093f91e594e5a0a03b34cec2c2a093)](https://circleci.com/gh/garden-io/garden/tree/master)

# garden

Just getting started now... More docs to follow.

## Setup

You need to set up the following on your local machine to use garden:
* Node.js >= 8.x
* Git
* [Docker](https://docs.docker.com/engine/installation/)

We recommend using Homebrew on Mac for everything except Docker - 
[Docker for Mac](https://docs.docker.com/docker-for-mac/install/) is 
usually a better choice and is well maintained.

## Developing the framework

### Setting up your environment

    ./bin/bootstrap-osx
    npm install

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
