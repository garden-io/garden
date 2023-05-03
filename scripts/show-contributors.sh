#!/bin/bash

if [[ $# != 2 ]]; then
  echo "Usage: $0 <previous-tag> <current-tag>"
  exit 1
fi

set -u

prev_tag=$1
cur_tag=$2
git log "${prev_tag}".."${cur_tag}" --no-merges "$@" | grep ^Author | sort | uniq -c | sort -nr
