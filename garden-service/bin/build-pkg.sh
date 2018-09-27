#!/bin/bash

garden_cli_root=$(cd `dirname $0` && cd .. && pwd)

cd ${garden_cli_root}

mkdir -p dist

cp node_modules/opn/xdg-open dist
cp node_modules/websocket/build/Release/bufferutil.node dist
cp node_modules/websocket/build/Release/validation.node dist

pkg -o dist/garden .
