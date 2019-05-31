#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

echo "Building version ${version}"

npm run build

docker build -t gardendev/garden:${version} .
docker build -t gardendev/garden-gcloud:${version} --build-arg NAME=garden --build-arg VERSION=${version} -f gcloud.Dockerfile .

echo "Pushing images"

docker push gardendev/garden:${version}
docker push gardendev/garden-gcloud:${version}
