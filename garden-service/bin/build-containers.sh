#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_service_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

base_tag=gardendev/garden:${version}
gcloud_tag=gardendev/garden-gcloud:${version}
buster_tag=gardendev/garden:${version}-buster

echo "Building version ${version}"

echo "-> Build ${base_tag}"
docker build -t ${base_tag} -f Dockerfile .
echo "-> Check ${base_tag}"
docker run --rm -it ${base_tag} version

echo "-> Build ${gcloud_tag}"
docker build -t ${gcloud_tag} --build-arg TAG=${version} -f gcloud.Dockerfile .
echo "-> Check ${gcloud_tag}"
docker run --rm -it ${gcloud_tag} version

echo "-> Build ${buster_tag}"
docker build -t ${buster_tag} -f buster.Dockerfile dist/linux-amd64
echo "-> Check ${buster_tag}"
docker run --rm -it ${buster_tag} version

