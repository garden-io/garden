#!/usr/bin/env bash

# based on https://github.com/k3s-io/k3s/blob/8915e4c7f7d56c6e5255b6c50b006e9c264133f1/scripts/package-airgap

set -e -x

ARCH="$1"
VERSION="$2"

cd $(dirname $0)/..

mkdir -p scripts/airgap
mkdir -p dist

airgap_image_file='scripts/airgap/image-list.txt'
rm -f "$airgap_image_file"
echo "$(find images/*/garden.yml -not -path '*/circleci-runner/*' | xargs perl -lne 'print $1 if /image: (.*)/')" > "$airgap_image_file"

images=$(cat "${airgap_image_file}")
xargs -n1 docker pull <<< "${images}"
docker save ${images} | gzip > "dist/garden-${VERSION}-airgap-images-${ARCH}.tar.gz"
sha256sum "dist/garden-${VERSION}-airgap-images-${ARCH}.tar.gz" | cut -d " " -f 1 > "dist/garden-${VERSION}-airgap-images-${ARCH}.tar.gz.sha256"
if [ ${ARCH} = amd64 ]; then
  cp "${airgap_image_file}" dist/garden-images.txt
fi
