# Telepresence example project

This example project demonstrates how to use [Telepresence](https://www.telepresence.io/) with Garden.

In some cases it can be useful to run the service that you're iterating on locally. A common workflow is to e.g. deploy the entire stack to a remote environment and then run the frontend service locally.

The problem with that approach is that the local service won't be able to receive network traffic.

This is where Telepresence comes in. It allows you to run a service locally but still receive network traffic as if it were in the remote environment.

Here we demonstrate a simple use case but Telepresence supports many more options, e.g. running the local service in a Docker container, and we encourage you to check out [their documentation](https://www.telepresence.io/docs/latest/) for more.

## Usage

> The following assumes you have Telepresence installed on your host.

Start by deploying the project with:

```console
garden deploy
```

Make note of the URL to the frontend.

Next, start Telepresence by running:

```console
garden run task start-telepresence
```

And lastly, start the local web server by changing into the frontend directory and running start command:

```console
cd frontend
npm run start
```
