#!/bin/sh

set -ex -o pipefail

# Build dependencies
apk add --virtual=build gcc libffi-dev musl-dev openssl-dev make readline linux-pam

# Runtime dependency
apk add bash sudo shadow python3-dev py3-pip virtualenv

# We install the azure CLI in a virtualenv, to avoid conflicts with the AWS CLI
python3 -m virtualenv /azure-cli
/azure-cli/bin/python -m pip --no-cache-dir install azure-cli

# Wrapper script to call the actual azure CLI inside virtualenv
echo "#!/usr/bin/env sh" > /usr/bin/az
echo '/azure-cli/bin/python -m azure.cli "$@"' >> /usr/bin/az

# Remove build dependencies
apk del --purge build

# Install Azure CLI
az aks install-cli
