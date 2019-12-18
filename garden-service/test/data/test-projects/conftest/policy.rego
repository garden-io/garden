package main

warn[msg] {
  input.shouldBeTrue = false
  msg = "shouldBeTrue should be true"
}

deny[msg] {
  input.shouldDefinitelyNotBeTrue = true
  msg = "shouldDefinitelyNotBeTrue must be false"
}