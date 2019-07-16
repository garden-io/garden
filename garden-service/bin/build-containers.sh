#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

echo "Building version ${version}"

docker build -t gardendev/garden:${version} .
docker build -t gardendev/garden-gcloud:${version} --build-arg TAG=${version} -f gcloud.Dockerfile .

echo "Sanity checking..."

docker run --rm -it gardendev/garden:${version} version
docker run --rm -it gardendev/garden-gcloud:${version} version
