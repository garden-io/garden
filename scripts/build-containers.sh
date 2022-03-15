#!/bin/bash -e

repo_root=$(cd `dirname $0` && cd .. && pwd)

cd ${repo_root}

args=( $@ )
version=${args[0]:-$(git rev-parse --short HEAD)}
common_args="--platform linux/amd64"

base_tag=gardendev/garden:${version}
aws_tag=gardendev/garden-aws:${version}
azure_tag=gardendev/garden-azure:${version}
gcloud_tag=gardendev/garden-gcloud:${version}
aws_gcloud_tag=gardendev/garden-aws-gcloud:${version}
aws_gcloud_azure_tag=gardendev/garden-aws-gcloud-azure:${version}
full_tag=gardendev/garden-full:${version}
buster_tag=gardendev/garden:${version}-buster

echo "Building version ${version}"

echo "-> Build ${base_tag}"
docker build ${common_args} -t ${base_tag} -f support/alpine.Dockerfile dist/alpine-amd64
echo "-> Check ${base_tag}"
docker run ${common_args} --rm -it ${base_tag} version

echo "-> Build ${gcloud_tag}"
docker build ${common_args} -t ${gcloud_tag} --build-arg TAG=${version} -f support/gcloud.Dockerfile dist/alpine-amd64
echo "-> Check ${gcloud_tag}"
docker run ${common_args} --rm -it ${gcloud_tag} version
docker run ${common_args} --rm -it --entrypoint=gcloud ${gcloud_tag} version

echo "-> Build ${aws_tag}"
docker build ${common_args} -t ${aws_tag} --build-arg TAG=${version} -f support/aws.Dockerfile dist/alpine-amd64
echo "-> Check ${aws_tag}"
docker run ${common_args} --rm -it ${aws_tag} version
docker run ${common_args} --rm -it --entrypoint=aws ${aws_tag} --version

echo "-> Build ${azure_tag}"
docker build ${common_args} -t ${azure_tag} --build-arg TAG=${version} -f support/azure.Dockerfile dist/alpine-amd64
echo "-> Check ${azure_tag}"
docker run ${common_args} --rm -it ${azure_tag} version
docker run ${common_args} --rm -it --entrypoint=az ${azure_tag} version

echo "-> Build ${aws_gcloud_tag}"
docker build ${common_args} -t ${aws_gcloud_tag} --build-arg TAG=${version} -f support/aws-gcloud.Dockerfile dist/alpine-amd64
echo "-> Check ${aws_gcloud_tag}"
docker run ${common_args} --rm -it ${aws_gcloud_tag} version
docker run ${common_args} --rm -it --entrypoint=aws ${aws_gcloud_tag} --version
docker run ${common_args} --rm -it --entrypoint=gcloud ${aws_gcloud_tag} version

echo "-> Build ${aws_gcloud_azure_tag}"
docker build ${common_args} -t ${aws_gcloud_azure_tag} --build-arg TAG=${version} -f support/aws-gcloud-azure.Dockerfile dist/alpine-amd64
echo "-> Check ${aws_gcloud_azure_tag}"
docker run ${common_args} --rm -it ${aws_gcloud_azure_tag} version
docker run ${common_args} --rm -it --entrypoint=aws ${aws_gcloud_azure_tag} --version
docker run ${common_args} --rm -it --entrypoint=gcloud ${aws_gcloud_azure_tag} version
docker run ${common_args} --rm -it --entrypoint=az ${aws_gcloud_azure_tag} version

echo "-> Build ${full_tag}"
docker build ${common_args} -t ${full_tag} --build-arg TAG=${version} -f support/full.Dockerfile dist/alpine-amd64
echo "-> Check ${full_tag}"
docker run ${common_args} --rm -it ${full_tag} version
docker run ${common_args} --rm -it --entrypoint=aws ${full_tag} --version
docker run ${common_args} --rm -it --entrypoint=gcloud ${full_tag} version
docker run ${common_args} --rm -it --entrypoint=az ${full_tag} version
docker run ${common_args} --rm -it --entrypoint=ibmcloud ${full_tag} help
# TODO: test ibmcloud CLI

echo "-> Build ${buster_tag}"
docker build ${common_args} -t ${buster_tag} -f support/buster.Dockerfile dist/linux-amd64
echo "-> Check ${buster_tag}"
docker run ${common_args} --rm -it ${buster_tag} version

