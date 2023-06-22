# jib-container example

This simple example showcases the [`jib-container` module type](https://docs.garden.io/reference/module-types/jib-container), which uses [Jib](https://github.com/GoogleContainerTools/jib) to build the container images instead of a normal Docker build.

The example services are adapted from the examples from the [Jib repository](https://github.com/GoogleContainerTools/jib/tree/master/examples).

The `helloworld` service just deploys a basic HTTP server that serves you a "Hello world" message. It's built using Gradle and the Jib plugin that's configured in `build.gradle`. Note that Garden sets the target image name automatically, so the `jib.to.image = ...` parameter is commented out.

The `spring-boot` is, as you might expect, a Spring Boot service. This one is configured both for Maven and Gradle. In the Garden configuration, we select Maven using the `build.projectType` field.

To deploy the services to a local Kubernetes cluster, simply run

```sh
garden deploy
```

To deploy to a remote cluster, first edit the `project.garden.yml` file to set the appropriate Kubernetes context, deployment registry etc. and then run

```sh
garden deploy --env=remote
```
