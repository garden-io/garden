#!/bin/sh

set -ex -o pipefail

# install runtime dependencies
apk add --no-cache python3 py3-pip

# install latest awscli
pip install awscli --upgrade

# Download aws-iam-authenticator. This is only necessary for legacy kubeconfigs.
# The version number and checksum need to be updated together.
# Consider removing this in a future release.
curl -o aws-iam-authenticator https://github.com/kubernetes-sigs/aws-iam-authenticator/releases/download/v0.6.2/aws-iam-authenticator_0.6.2_linux_amd64
echo "953faf58a5e3653d6355e8f2c35aa4daaafb1c28987708a6c72760f49dc91023  aws-iam-authenticator" > SHA256SUM.txt

# Check aws-iam-authenticator checksums
sha256sum -wc SHA256SUM.txt && rm SHA256SUM.txt

# Install aws-iam-authenticator
chmod +x ./aws-iam-authenticator
mv ./aws-iam-authenticator /usr/bin/
