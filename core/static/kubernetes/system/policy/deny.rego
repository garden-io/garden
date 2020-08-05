package main

import data.kubernetes

name = input.metadata.name

deny[msg] {
  kubernetes.is_deployment
  toleration := {
    "key": "garden-system",
    "operator": "Equal",
    "value": "true",
    "effect": "NoSchedule",
  }
  input.spec.template.spec.tolerations[_] != toleration

  msg = sprintf("Deployment %s is missing toleration of kind %v", [name, toleration])
}
