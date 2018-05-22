#!/bin/sh

set -e

cd /functions

functions-emulator start --bindHost 0.0.0.0

functions-emulator deploy $1 \
  --trigger-http \
  --project local \
  --region local

functions-emulator stop > /dev/null
functions-emulator start --bindHost 0.0.0.0 --tail
