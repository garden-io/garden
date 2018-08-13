#!/bin/bash
set -e

cli_filename="faas-cli"

if [ "${PLATFORM}" = "darwin" ]; then
  cli_filename="faas-cli-darwin"
elif [ "${PLATFORM}" = "win32" ]; then
  cli_filename="faas-cli.exe"
fi

# use npx for cross-platform compatibility
npx node-wget -- https://github.com/openfaas/faas-cli/releases/download/0.6.15/${cli_filename}
mv ${cli_filename} faas-cli || true 
chmod +x faas-cli

./faas-cli template pull
