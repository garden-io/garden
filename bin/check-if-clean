#!/usr/bin/env bash

if [[ $(git diff --shortstat 2> /dev/null | tail -n1) != "" ]]; then
  echo "Working directory is dirty!"
  exit 1
fi
