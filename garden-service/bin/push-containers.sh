#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

./bin/build-containers.sh "$@"

echo "Pushing images"

docker push gardendev/garden:${version}
docker push gardendev/garden-aws:${version}
docker push gardendev/garden-gcloud:${version}
docker push gardendev/garden:${version}-buster
