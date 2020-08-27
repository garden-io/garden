#!/bin/bash -e

repo_root=$(cd `dirname $0` && cd .. && pwd)

cd ${repo_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

./scripts/build-containers.sh "$@"

echo "Pushing images"

docker push gardendev/garden:${version}
docker push gardendev/garden-aws:${version}
docker push gardendev/garden-azure:${version}
docker push gardendev/garden-gcloud:${version}
docker push gardendev/garden-aws-gcloud:${version}
docker push gardendev/garden:${version}-buster
