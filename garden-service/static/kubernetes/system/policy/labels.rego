package main

import data.kubernetes

name = input.metadata.name

# TODO: Re-enable this policy (or some version thereof)
# labels {
#     input.metadata.labels["app.kubernetes.io/name"]
#     input.metadata.labels["app.kubernetes.io/instance"]
#     input.metadata.labels["app.kubernetes.io/version"]
#     input.metadata.labels["app.kubernetes.io/component"]
#     input.metadata.labels["app.kubernetes.io/part-of"]
#     input.metadata.labels["app.kubernetes.io/managed-by"]
# }
#
# deny[msg] {
#   kubernetes.is_deployment
#   not labels
#   msg = sprintf("%s must include Kubernetes recommended labels: https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/#labels ", [name])
# }
