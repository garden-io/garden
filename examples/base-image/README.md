# Base Image

This example demonstrates how to use a base Docker image that other actions can extend. This is for example useful when you have several actions written in the same programming language that all share a similar `Dockerfile` structure.

The example also shows how you can use different `Dockerfile`s depending on your environment. For example, when you have a development image that includes some tools or code that you don't want in your production image.

## Project Structure

The example has a `base-image` build action and a single `backend` application (in a real world scenario, you might have multiple applications that all extend the same base image). The `base-image` directory only contains a `Dockerfile` and the build action configuration.

The `backend` application contains the source code and has two `Dockerfile`s, one for development and one for production. Both `Dockerfile`s extend the image from the `base-image` build action, and each sets an `APP_ENV` environment variable that the `backend` returns when called.

To achieve this, we set the `base-image` as a build dependency for the `backend` build action:

```yaml
# In backend/backend.garden.yml
kind: Build
name: backend
...
dependencies: [ build.base-image ]
```

This ensures that the `base-image` is built ahead of the `backend`.

We also use [build arguments](https://docs.docker.com/engine/reference/builder/#arg) in the Dockerfile and the [`garden.yml`](../../docs/reference/action-types/Build/container.md) config so that the correct base image version is used:

```yaml
# In backend/backend.garden.yml
kind: Build
name: backend
...
# The build arguments to use when building the image.
# Corresponds to the ARG directive in the Dockerfile.
spec:
  buildArgs:
    BASE_IMAGE_VERSION: ${actions.build.base-image.version}
```

and

```Dockerfile
# In backend/Dockerfile.dev
ARG BASE_IMAGE_VERSION
FROM base-image:${BASE_IMAGE_VERSION}
ENV APP_ENV=development
```

Finally, we tell Garden to use a `Dockerfile` based on the environment:

```yaml
# In backend/backend.garden.yml
kind: Build
name: backend
...
spec:
  dockerfile: "${environment.name == 'prod' ? 'Dockerfile.prod' : 'Dockerfile.dev'}"
```

## Usage

Run `garden deploy` to deploy the project. It defaults to deploying the `dev` environment.

If you now run `garden deploy --env prod` and open the displayed Ingress URL after deployment, you should see: `production backend says hi!`.
