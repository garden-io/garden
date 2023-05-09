# Dockerize a Spring Boot application using Jib

This is an example of how to easily build a Docker image for a Spring Boot application with Jib.

## Try it yourself

You can containerize the application with one of the following commands.

**Maven:**

```shell
./mvnw compile jib:build -Dimage=<your image, eg. gcr.io/my-project/spring-boot-jib>
```

**Gradle:**

```shell
./gradlew jib --image=<your image, eg. gcr.io/my-project/spring-boot-jib>
```

## Deploying to Kubernetes using `kubectl`

<p align="center">=
    <img src="dockerize-spring-boot-jib.gif" width="600" alt="Dockerize Spring Boot app with Jib and deploy to Kubernetes">
  </a>
</p>

_Make sure you have `kubectl` installed and [configured with a cluster](https://cloud.google.com/kubernetes-engine/docs/how-to/creating-a-cluster)._

```shell
IMAGE=<your image, eg. gcr.io/my-project/spring-boot-jib>

./mvnw compile jib:build -Dimage=$IMAGE

kubectl run spring-boot-jib --image=$IMAGE --port=8080 --restart=Never

# Wait until pod is running
kubectl port-forward spring-boot-jib 8080
```

```shell
curl localhost:8080
> Greetings from Spring Boot and Jib!
```

\* If you are using Gradle, use `./gradlew jib --image=$IMAGE` instead of the `./mvnw` command

## More information

Learn [more about Jib](https://github.com/GoogleContainerTools/jib).
