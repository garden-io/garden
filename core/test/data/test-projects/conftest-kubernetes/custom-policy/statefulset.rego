package main

deny[msg] {
  input.kind = StatefulSet
  input.spec.replicas = 1
  msg = "StatefulSet replicas should not be 1"
}
