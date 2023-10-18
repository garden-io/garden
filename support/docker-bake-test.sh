#!/bin/bash

set -x -e -o pipefail

# Bash test framework. Sorry :D
fail() {
  echo "FAIL: $@"
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

run_binary() {
  binary=$1
  command=$2
  image=$3

  docker run --pull=never --platform=linux/amd64 --rm -it --entrypoint=$binary $image $command
}

should_succeed() {
  if run_binary $@; then
    echo "OK: command run_binary $@ succeeded as expected"
  else
    fail "command run_binary $@ should have succeeded"
  fi
}

should_fail() {
  if run_binary $@; then
    fail "command run_binary $@ should have failed"
  else
    echo "OK: command run_binary $@ failed as expected"
  fi
}

before_each() {
  # Clean all docker image tags
  docker images --format "{{.Repository}}:{{.Tag}}" | xargs docker rmi  || true
}

TEST() {
  echo "TEST: $@"
  before_each
}

TEST "test cloud provider tool availability"
  MAJOR_VERSION=0 MINOR_VERSION=12 PATCH_VERSION=0 CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  # aws
  should_succeed aws --version gardendev/garden-aws-gcloud-azure
  should_succeed aws --version gardendev/garden-aws-gcloud
  should_succeed aws --version gardendev/garden-aws
  should_fail aws --version gardendev/garden
  should_fail aws --version gardendev/garden-gcloud
  should_fail aws --version gardendev/garden-azure

  # Gcloud
  should_succeed gcloud version gardendev/garden-aws-gcloud-azure
  should_succeed gcloud version gardendev/garden-aws-gcloud
  should_succeed gcloud version gardendev/garden-gcloud
  should_fail gcloud version gardendev/garden
  should_fail gcloud version gardendev/garden-azure
  should_fail gcloud version gardendev/garden-aws

  # Azure
  should_succeed az version gardendev/garden-aws-gcloud-azure
  should_succeed az version gardendev/garden-azure
  should_fail az version gardendev/garden
  should_fail az version gardendev/garden-gcloud
  should_fail az version gardendev/garden-aws
  should_fail az version gardendev/garden-aws-gcloud

TEST "run all binaries"
  MAJOR_VERSION=0 MINOR_VERSION=12 PATCH_VERSION=0 CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl all

  # garden
  should_succeed garden --version gardendev/garden-aws-gcloud-azure
  should_succeed garden --version gardendev/garden-aws-gcloud
  should_succeed garden --version gardendev/garden-aws
  should_succeed garden --version gardendev/garden-gcloud
  should_succeed garden --version gardendev/garden-azure
  should_succeed garden --version gardendev/garden:acorn-alpine
  should_succeed garden --version gardendev/garden:acorn-buster

  # aws
  should_succeed aws --version gardendev/garden-aws-gcloud-azure
  should_succeed aws --version gardendev/garden-aws-gcloud
  should_succeed aws --version gardendev/garden-aws

  # Gcloud
  should_succeed gcloud version gardendev/garden-aws-gcloud-azure
  should_succeed gcloud version gardendev/garden-aws-gcloud
  should_succeed gcloud version gardendev/garden-gcloud

  # Azure
  should_succeed az version gardendev/garden-aws-gcloud-azure
  should_succeed az version gardendev/garden-azure

TEST "edge tags for buster"
  MAJOR_VERSION=0 MINOR_VERSION=12 PRERELEASE=edge CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl buster

  should_not_exist gardendev/garden latest
  should_not_exist gardendev/garden 0.12-buster
  should_exist gardendev/garden 0.12-edge-buster
  should_exist gardendev/garden acorn-edge-buster

TEST "edge tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=12 PRERELEASE=edge CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.12-alpine
    should_exist $image 0.12-edge-alpine
    should_exist $image acorn-edge-alpine
  done

TEST "prerelease tags for buster"
  MAJOR_VERSION=0 MINOR_VERSION=12 PATCH_VERSION=0 PRERELEASE=alpha1 CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl buster

  should_not_exist gardendev/garden latest
  should_not_exist gardendev/garden 0.12-buster
  should_not_exist gardendev/garden 0.12-alpha1-buster
  should_not_exist gardendev/garden acorn-alpha1-buster
  should_exist gardendev/garden 0.12.0-alpha1-buster

TEST "prerelease tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=12 PATCH_VERSION=0 PRERELEASE=alpha1 CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.12-alpine
    should_not_exist $image 0.12-alpha1-alpine
    should_not_exist $image acorn-alpha1-alpine
    should_exist gardendev/garden 0.12.0-alpha1-alpine
  done

TEST "production release tags for buster"
  MAJOR_VERSION=0 MINOR_VERSION=12 PATCH_VERSION=0 CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl buster

  should_not_exist gardendev/garden latest
  should_exist gardendev/garden 0.12-buster
  should_exist gardendev/garden 0.12.0-buster
  should_exist gardendev/garden acorn-buster
  should_not_exist gardendev/garden 0.12-edge-buster
  should_not_exist gardendev/garden acorn-edge-buster

TEST "production release tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=12 PATCH_VERSION=0 CODENAME=acorn \
    docker buildx bake --progress=plain -f support/docker-bake.hcl alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_exist $image 0.12-alpine
    should_exist $image 0.12.0-alpine
    should_exist $image acorn-alpine
    should_not_exist $image 0.12-edge-alpine
    should_not_exist $image acorn-edge-alpine
  done
