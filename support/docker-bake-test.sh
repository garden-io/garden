#!/bin/bash

set -x -e -o pipefail

# Bash test framework. Sorry :D
fail() {
  echo "FAIL: $1"
  exit 1
}

tag_exists() {
  image=$1
  tag=$2

  docker image ls "$image" | grep "$tag" > /dev/null
}

should_exist() {
if tag_exists $@; then
  echo "OK: $image:$tag exists"
else
  fail "$image: tag \"$tag\" should exist"
fi
}

should_not_exist() {
if tag_exists $@; then
  fail "$image: tag \"$tag\" should not exist"
else
  echo "OK: $image:$tag does not exist"
fi
}

before_each() {
  # Clean all docker image tags
  docker images --format "{{.Repository}}:{{.Tag}}" | xargs docker rmi  || true
}

TEST() {
  echo "$1"
  before_each
}

TEST "edge tags for buster"
  MAJOR_VERSION=0 MINOR_VERSION=13 PRERELEASE=edge CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl buster

  should_not_exist gardendev/garden latest
  should_not_exist gardendev/garden 0.13-buster
  should_exist gardendev/garden 0.13-edge-buster
  should_exist gardendev/garden bonsai-edge-buster

TEST "edge tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=13 PRERELEASE=edge CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.13-alpine
    should_exist $image 0.13-edge-alpine
    should_exist $image bonsai-edge-alpine
  done

TEST "prerelease tags for buster"
  MAJOR_VERSION=0 MINOR_VERSION=13 PATCH_VERSION=0 PRERELEASE=alpha1 CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl buster

  should_not_exist gardendev/garden latest
  should_not_exist gardendev/garden 0.13-buster
  should_not_exist gardendev/garden 0.13-alpha1-buster
  should_not_exist gardendev/garden bonsai-alpha1-buster
  should_exist gardendev/garden 0.13.0-alpha1-buster

TEST "prerelease tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=13 PATCH_VERSION=0 PRERELEASE=alpha1 CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.13-alpine
    should_not_exist $image 0.13-alpha1-alpine
    should_not_exist $image bonsai-alpha1-alpine
    should_exist gardendev/garden 0.13.0-alpha1-alpine
  done

TEST "production release tags for buster"
  MAJOR_VERSION=0 MINOR_VERSION=13 PATCH_VERSION=0 CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl buster

  should_not_exist gardendev/garden latest
  should_exist gardendev/garden 0.13-buster
  should_exist gardendev/garden 0.13.0-buster
  should_exist gardendev/garden bonsai-buster
  should_not_exist gardendev/garden 0.13-edge-buster
  should_not_exist gardendev/garden bonsai-edge-buster

TEST "production release tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=13 PATCH_VERSION=0 CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_exist $image latest
    should_exist $image 0.13-alpine
    should_exist $image 0.13.0-alpine
    should_exist $image bonsai-alpine
    should_not_exist $image 0.13-edge-alpine
    should_not_exist $image bonsai-edge-alpine
  done

TEST "run all binaries"
  MAJOR_VERSION=0 MINOR_VERSION=13 PATCH_VERSION=0 CODENAME=bonsai \
    docker buildx bake --progress=plain -f support/docker-bake.hcl all

  # garden
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden-aws-gcloud-azure --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden-aws-gcloud --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden-aws --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden-gcloud --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden-azure --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden:bonsai-alpine --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=garden gardendev/garden:bonsai-buster --version

  # aws
  docker run --platform=linux/amd64 --rm -it --entrypoint=aws gardendev/garden-aws-gcloud-azure --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=aws gardendev/garden-aws-gcloud --version
  docker run --platform=linux/amd64 --rm -it --entrypoint=aws gardendev/garden-aws --version

  # Gcloud
  docker run --platform=linux/amd64 --rm -it --entrypoint=gcloud gardendev/garden-aws-gcloud-azure version
  docker run --platform=linux/amd64 --rm -it --entrypoint=gcloud gardendev/garden-aws-gcloud version
  docker run --platform=linux/amd64 --rm -it --entrypoint=gcloud gardendev/garden-gcloud version

  # Azure
  docker run --platform=linux/amd64 --rm -it --entrypoint=az gardendev/garden-aws-gcloud-azure version
  docker run --platform=linux/amd64 --rm -it --entrypoint=az gardendev/garden-azure version
