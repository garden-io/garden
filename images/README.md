# Images

Here we place container images that we maintain and reference when using Garden.

We are building all images except the circleci image multi-platform for linux/arm64 and linux/amd64. To setup building multi-platform with buildx locally check instructions for:

* Docker Desktop: https://docs.docker.com/build/building/multi-platform/#building-multi-platform-images
* Orbstack: https://docs.orbstack.dev/docker/images#multiplatform

Please note that the images are not available in your local docker images store, because they are build in the docker-container buildx builder. They are always pushed to DockerHub. If you want to inspect and run them locally pull them down.

To publish an updated version of these images update the `release-tag` in the respective action and run `garden publish`.
