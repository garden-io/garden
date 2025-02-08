terraform {
  required_version = ">= 0.12"
  backend "http" {
    address = ""
  }
}

resource "null_resource" "say-hello" {
  provisioner "local-exec" {
    command = "echo 'Hello friend'"
  }
}

