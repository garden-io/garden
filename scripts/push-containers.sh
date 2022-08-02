#!/bin/bash -e

repo_root=$(cd `dirname $0` && cd .. && pwd)

cd ${repo_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

./scripts/build-containers.sh "$@"

echo "Pushing images"

docker push gardendev/garden:${version}
docker push gardendev/garden:${version}-aws
docker push gardendev/garden:${version}-azure
docker push gardendev/garden:${version}-gcloud
docker push gardendev/garden:${version}-aws-gcloud
docker push gardendev/garden:${version}-aws-gcloud-azure
docker push gardendev/garden:${version}-buster
