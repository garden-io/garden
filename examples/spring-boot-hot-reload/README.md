# Spring Boot example project

This example demonstrates Spring Boot running inside a Docker container (managed by a local Kubernetes cluster) with Spring Boot's dev tools enabled. We'll walk through live-restarting a Spring Boot service on compilation via Garden's hot reload functionality.

## Prerequisites

You'll need to have Java and [Maven](https://maven.apache.org/install.html) installed (follow the appropriate installation instructions for your platform).

## Overview

This project consists of a single module (in the `devtools` directory), which is a minimally modified version of the [Spring Boot devtools sample project found here](https://github.com/spring-projects/spring-boot/tree/master/spring-boot-project/spring-boot-devtools).

We've changed the parent pom from `spring-boot-samples` to `spring-boot-starter-parent`, and added a dependency on `spring-boot-starter-actuator` (to enable the health check endpoint for k8s readiness and liveness probes). We've also removed the artificial 5 second delay that was added by the `slowRestart` method in `MyController`.

## Usage

First, run `mvn compile` in the `devtools` directory. This will download the service's dependencies and compile it. Afterwards, you should see the `target` directory appear (under `devtools`).

Subsequent calls to `mvn compile` will be much faster, since the dependencies will have been cached by Maven.

You can now deploy the service with hot reloading enabled e.g. by running

```
garden deploy --hot=devtools
```

This should produce output that's something like this:

```
Deploy 🚀

✔ devtools                  → Building devtools:v-c6b9091207... → Done (
took 0.4 sec)
✔ devtools                  → Deploying version v-c6b9091207... → Done (
took 67 sec)
    → Ingress: http://spring-boot-hot-reload.local.app.garden
🌻  Garden dashboard and API server running on http://localhost:50934

🕑  Waiting for code changes
```
Open the ingress URL (http://spring-boot-hot-reload.local.app.garden above) in a web browser.

Now, change the value of the `MESSAGE` constant in `devtools/src/main/java/sample/devtools/Message.java` to something else than `"Message"`, and run `mvn compile` (again in the `devtools` directory).

This should trigger a hot reload. Refresh the the browser tab opened earlier, and you should see the change you made reflected in the header text.