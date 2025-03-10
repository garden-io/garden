#!/bin/bash

set -e -o pipefail

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
  docker images --format "{{.Repository}}:{{.Tag}}" | xargs docker rmi -f  || true
}

TEST() {
  echo "TEST: $@"
  before_each
}

TEST "test cloud provider tool availability"
  MAJOR_VERSION=0 MINOR_VERSION=14 PATCH_VERSION=0 CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" all

  # aws
  for variant in cedar{-alpine,-bookworm}{,-rootless}
    do
    echo "gardendev/garden-aws-gcloud-azure:$variant"
    should_succeed aws --version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed aws --version gardendev/garden-aws-gcloud:$variant
    should_succeed aws --version gardendev/garden-aws:$variant
    should_fail aws --version gardendev/garden:$variant
    should_fail aws --version gardendev/garden-gcloud:$variant
    should_fail aws --version gardendev/garden-azure:$variant

    # Gcloud
    should_succeed gcloud version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed gcloud version gardendev/garden-aws-gcloud:$variant
    should_succeed gcloud version gardendev/garden-gcloud:$variant
    should_fail gcloud version gardendev/garden:$variant
    should_fail gcloud version gardendev/garden-azure:$variant
    should_fail gcloud version gardendev/garden-aws:$variant

    # Azure
    should_succeed az version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed az version gardendev/garden-azure:$variant
    should_fail az version gardendev/garden:$variant
    should_fail az version gardendev/garden-gcloud:$variant
    should_fail az version gardendev/garden-aws:$variant
    should_fail az version gardendev/garden-aws-gcloud:$variant
  done

TEST "run all binaries"
  MAJOR_VERSION=0 MINOR_VERSION=14 PATCH_VERSION=0 CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" all

  for variant in cedar{-alpine,-bookworm}{,-rootless}
    do
    # Garden on vanilla images
    should_succeed garden version gardendev/garden:$variant
    should_succeed garden version gardendev/garden:$variant

    # garden
    should_succeed garden version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed garden version gardendev/garden-aws-gcloud:$variant
    should_succeed garden version gardendev/garden-aws:$variant
    should_succeed garden version gardendev/garden-gcloud:$variant
    should_succeed garden version gardendev/garden-azure:$variant

    # aws
    should_succeed aws --version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed aws --version gardendev/garden-aws-gcloud:$variant
    should_succeed aws --version gardendev/garden-aws:$variant

    # Gcloud
    should_succeed gcloud version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed gcloud version gardendev/garden-aws-gcloud:$variant
    should_succeed gcloud version gardendev/garden-gcloud:$variant

    # Azure
    should_succeed az version gardendev/garden-aws-gcloud-azure:$variant
    should_succeed az version gardendev/garden-azure:$variant
  done

TEST "edge tags for debian"
  MAJOR_VERSION=0 MINOR_VERSION=14 PRERELEASE=edge CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" bookworm

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.14-bookworm
    should_not_exist $image 0.14-bookworm-rootless
    should_exist $image 0.14-edge-bookworm
    should_exist $image 0.14-edge-bookworm-rootless
    should_exist $image cedar-edge-bookworm
    should_exist $image cedar-edge-bookworm-rootless
  done

TEST "edge tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=14 PRERELEASE=edge CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.14-alpine
    should_not_exist $image 0.14-alpine-rootless
    should_exist $image 0.14-edge-alpine
    should_exist $image 0.14-edge-alpine-rootless
    should_exist $image cedar-edge-alpine
    should_exist $image cedar-edge-alpine-rootless
  done

TEST "prerelase tags for debian"
  MAJOR_VERSION=0 MINOR_VERSION=14 PATCH_VERSION=0 PRERELEASE=alpha1 CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" bookworm


  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.14-bookworm
    should_not_exist $image 0.14-bookworm-rootless
    should_not_exist $image 0.14-alpha1-bookworm
    should_not_exist $image 0.14-alpha1-bookworm-rootless
    should_not_exist $image cedar-alpha1-bookworm
    should_not_exist $image cedar-alpha1-bookworm-rootless
    should_exist gardendev/garden 0.14.0-alpha1-bookworm
    should_exist gardendev/garden 0.14.0-alpha1-bookworm-rootless
  done

TEST "prerelease tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=14 PATCH_VERSION=0 PRERELEASE=alpha1 CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_not_exist $image 0.14-alpine
    should_not_exist $image 0.14-alpine-rootless
    should_not_exist $image 0.14-alpha1-alpine
    should_not_exist $image 0.14-alpha1-alpine-rootless
    should_not_exist $image cedar-alpha1-alpine
    should_not_exist $image cedar-alpha1-alpine-rootless
    should_exist gardendev/garden 0.14.0-alpha1-alpine
    should_exist gardendev/garden 0.14.0-alpha1-alpine-rootless
  done

TEST "production release tags for debian"
  MAJOR_VERSION=0 MINOR_VERSION=14 PATCH_VERSION=0 CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" bookworm


  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_not_exist $image latest
    should_exist $image 0.14-bookworm
    should_exist $image 0.14-bookworm-rootless
    should_exist $image 0.14.0-bookworm
    should_exist $image 0.14.0-bookworm-rootless
    should_exist $image cedar-bookworm
    should_exist $image cedar-bookworm-rootless
    should_not_exist $image 0.14-edge-bookworm
    should_not_exist $image 0.14-edge-bookworm-rootless
    should_not_exist $image cedar-edge-bookworm
    should_not_exist $image cedar-edge-bookworm-rootless
  done

TEST "production release tags for alpine"
  MAJOR_VERSION=0 MINOR_VERSION=14 PATCH_VERSION=0 CODENAME=cedar \
    docker buildx bake --progress=plain -f "$(dirname "$0")/docker-bake.hcl" alpine

  for image in gardendev/garden{,-aws,-azure,-gcloud,-aws-gcloud,-aws-gcloud-azure}
    do
    should_exist $image latest
    should_exist $image 0.14-alpine
    should_exist $image 0.14-alpine-rootless
    should_exist $image 0.14.0-alpine
    should_exist $image 0.14.0-alpine-rootless
    should_exist $image cedar-alpine
    should_exist $image cedar-alpine-rootless
    should_not_exist $image 0.14-edge-alpine
    should_not_exist $image 0.14-edge-alpine-rootless
    should_not_exist $image cedar-edge-alpine
    should_not_exist $image cedar-edge-alpine-rootless
  done
