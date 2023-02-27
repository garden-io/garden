#!/usr/bin/env bash

# based on https://github.com/k3s-io/k3s/blob/8915e4c7f7d56c6e5255b6c50b006e9c264133f1/scripts/package-airgap

set -e -x

ARCH="$1"

cd $(dirname $0)/..

mkdir -p scripts/airgap
mkdir -p dist

airgap_image_file='scripts/airgap/image-list.txt'
echo "$(find images/*/garden.yml | xargs perl -lne 'print $1 if /image: (.*)/')" > "$airgap_image_file"

images=$(cat "${airgap_image_file}")
xargs -n1 docker pull <<< "${images}"
docker save ${images} | gzip > dist/garden-airgap-images-${ARCH}.tar.gz
if [ ${ARCH} = amd64 ]; then
  cp "${airgap_image_file}" dist/garden-images.txt
fi
