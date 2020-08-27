#!/bin/bash -e

repo_root=$(cd `dirname $0` && cd .. && pwd)

cd ${repo_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}

base_tag=gardendev/garden:${version}
aws_tag=gardendev/garden-aws:${version}
azure_tag=gardendev/garden-azure:${version}
gcloud_tag=gardendev/garden-gcloud:${version}
aws_gcloud_tag=gardendev/garden-aws-gcloud:${version}
buster_tag=gardendev/garden:${version}-buster

echo "Building version ${version}"

echo "-> Build ${base_tag}"
docker build -t ${base_tag} -f support/alpine.Dockerfile dist/alpine-amd64
echo "-> Check ${base_tag}"
docker run --rm -it ${base_tag} version

echo "-> Build ${aws_tag}"
docker build -t ${aws_tag} --build-arg TAG=${version} -f support/aws.Dockerfile dist/alpine-amd64
echo "-> Check ${aws_tag}"
docker run --rm -it ${aws_tag} version
docker run --rm -it --entrypoint=aws ${aws_tag} --version

echo "-> Build ${azure_tag}"
docker build -t ${azure_tag} --build-arg TAG=${version} -f support/azure.Dockerfile dist/alpine-amd64
echo "-> Check ${azure_tag}"
docker run --rm -it ${azure_tag} version

echo "-> Build ${gcloud_tag}"
docker build -t ${gcloud_tag} --build-arg TAG=${version} -f support/gcloud.Dockerfile dist/alpine-amd64
echo "-> Check ${gcloud_tag}"
docker run --rm -it ${gcloud_tag} version

echo "-> Build ${aws_gcloud_tag}"
docker build -t ${aws_gcloud_tag} --build-arg TAG=${version} -f support/aws-gcloud.Dockerfile dist/alpine-amd64
echo "-> Check ${aws_gcloud_tag}"
docker run --rm -it ${aws_gcloud_tag} version

echo "-> Build ${buster_tag}"
docker build -t ${buster_tag} -f support/buster.Dockerfile dist/linux-amd64
echo "-> Check ${buster_tag}"
docker run --rm -it ${buster_tag} version

