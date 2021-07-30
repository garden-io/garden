#!/bin/bash -e

# Downloads binaries, computes and prints their SHAs. Useful when adding new tools or new versions of existing tools.
#
# Usage: ./compute-ext-tool-binary-shas <darwin-dl-url> <linux-dl-url> <win-dl-url>

darwin_dl_url=$1
linux_dl_url=$2
win_dl_url=$3

platforms=("Darwin" "Linux" "Windows")
urls=($1 $2 $3)

for i in ${!platforms[@]}; do
  echo "Downloading ${platforms[$i]} binary at ${urls[$i]}..."
  # We use the -L option, in case there's a redirect before downloading starts
  curl -L ${urls[$i]} --show-error --silent --output ext_tool_tmp
  echo "sha256 of ${platforms[$i]} binary: $(shasum -a 256 ext_tool_tmp | cut -f1 -d " ")"
  rm ext_tool_tmp
  echo ""
done
