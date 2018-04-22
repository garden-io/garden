#!/bin/sh

cd /functions

functions-emulator start --bindHost 0.0.0.0

functions-emulator deploy $2 \
  --trigger-http \
  --project local \
  --region local

functions-emulator stop > /dev/null
functions-emulator start --bindHost 0.0.0.0 --tail
