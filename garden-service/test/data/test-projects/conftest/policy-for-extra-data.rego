package main

deny[msg] {
  input.normalInput = false
  msg = "normalInput must be true"
}

deny[msg] {
  input.data.extraData = false
  msg = "data.extraData must be true"
}