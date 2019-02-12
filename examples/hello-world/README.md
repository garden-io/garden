<p align="center">

  <a href="https://docs.openfaas.com/" style="margin-right: 1.5em;">
    <img alt="openfaas" src="https://blog.alexellis.io/content/images/2017/08/faas_side.png" width="100" />
  </a>
  <a href="https://www.docker.com/" style="margin-right: 1.5em;">
    <img alt="docker" src="https://upload.wikimedia.org/wikipedia/commons/4/4e/Docker_%28container_engine%29_logo.svg" width="100" />
  </a>
  <a href="https://www.npmjs.com/">
    <img alt="npm" src="https://upload.wikimedia.org/wikipedia/commons/d/db/Npm-logo.svg" width="60" />
  </a>
</p>

# Example project using NPM, OpenFaaS, and Docker

This project shows how you can configure Garden to use dependencies (NPM package), functions (OpenFaaS), and containers (Docker).

```sh
# Build dependency
hello-container -> hello-npm-package
# Runtime dependency
hello-container -> hello-function (openfaas)
```

## Usage

Use the `deploy` command to deploy the project:

```sh
garden deploy
```

Use the `call` command to get the output of the hello-container endpoint:
```sh
garden call hello-container/hello

✔ Sending HTTP GET request to http://hello-world.local.app.garden/hello

200 OK

{
  "message": "Hello there, I'm an OpenFaaS function"
}

```

or call the function directly:

```sh
garden call hello-function/function/hello-function

✔ Sending HTTP GET request to http://hello-world.local.app.garden/function/hello-function

200 OK

an OpenFaaS function
```
