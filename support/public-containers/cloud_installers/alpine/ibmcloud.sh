#!/bin/sh

set -ex -o pipefail

mkdir -p /opt/ibmcloud
cd /opt/ibmcloud

# Version and checksum need to be updated together
curl -o ibmcloud_installer.tar.gz https://download.clis.cloud.ibm.com/ibm-cloud-cli/2.15.0/IBM_Cloud_CLI_2.15.0_amd64.tar.gz
echo "2367a4cc6560466f89ed73b4431d575995d1e16b9f9366049294b751c1076925  ibmcloud_installer.tar.gz" > SHA256SUM.txt

# ibmcloud_installer.tar.gz checksums
sha256sum -wc SHA256SUM.txt && rm SHA256SUM.txt

# NOTE: We could also verify IBM binaries, see also https://github.com/IBM-Cloud/ibm-cloud-cli-release/wiki/Verify-Binaries#verify-linux-binaries
# - but then we would run the installer without verification, and only verify the installed binary? That doesn't seem secure to me.

tar -zxf ibmcloud_installer.tar.gz
cd Bluemix_CLI/
./install
cd $HOME

# install plugins
ibmcloud plugin install container-service
