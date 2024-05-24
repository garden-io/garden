# Images

Here we place container images that we maintain and reference when using Garden.

We are building all images except the circleci image multi-platform for linux/arm64 and linux/amd64. To setup building multi-platform with buildx locally check instructions for:

* Docker Desktop: https://docs.docker.com/build/building/multi-platform/#building-multi-platform-images
* Orbstack: https://docs.orbstack.dev/docker/images#multiplatform

Please note that the images are not available in your local docker images store, because they are build in the docker-container buildx builder. They are always pushed to DockerHub. If you want to inspect and run them locally pull them down.

To build and push to DockerHub with a tag `dev` use `garden build`, and to publish a new image with a version tag specified in the `release_tag` variable run `garden build --var publish=true`.

This is an intermediate step to allow multi platform builds and publish them to DockerHub until multi-platform builds are integrated more natively into garden and work with the publish command.
