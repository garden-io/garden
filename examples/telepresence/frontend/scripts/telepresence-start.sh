#!/bin/bash

namespace=$1
port=$2
port_name=$3
env_file_name=$4

mkdir -p tmp

telepresence connect
telepresence intercept frontend -n $namespace --port $port:$port_name --env-file $env_file_name
