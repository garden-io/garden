package main

deny[msg] {
  input.normalInput = false
  msg = "normalInput must be true"
}

import data.extraData

deny[msg] {
  extraData = false
  msg = "extraData must be true"
}