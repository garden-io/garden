package main

import data.kubernetes


name = input.metadata.name

warn[msg] {
  kubernetes.is_service
  msg = sprintf("Found service %s but services are not allowed", [name])
}
