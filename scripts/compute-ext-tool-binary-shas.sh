#!/bin/bash -e

# Downloads binaries, computes and prints their SHAs. Useful when adding new tools or new versions of existing tools.
#
# Usage: ./compute-ext-tool-binary-shas <darwin-x64-dl-url> <darwin-arm64-dl-url> <linux-dl-url> <win-dl-url>

platforms=("Darwin-x64" "Darwin-arm64" "Linux" "Windows")
urls=($1 $2 $3 $4)

for i in ${!platforms[@]}; do
  echo "Downloading ${platforms[$i]} binary at ${urls[$i]}..."
  # We use the -L option, in case there's a redirect before downloading starts
  curl -L ${urls[$i]} --show-error --silent --output ext_tool_tmp
  echo "sha256 of ${platforms[$i]} binary: $(shasum -a 256 ext_tool_tmp | cut -f1 -d " ")"
  rm ext_tool_tmp
  echo ""
done
