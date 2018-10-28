#!/bin/bash -e

garden_service_root=$(cd `dirname $0` && cd .. && pwd)
kubernetes_client_path="vendor/github.com/garden-io/javascript/node-client"

cd ${garden_service_root}

cd ${kubernetes_client_path}
npm install
npm run build

cd ${garden_service_root}
npm install --production ${kubernetes_client_path}
