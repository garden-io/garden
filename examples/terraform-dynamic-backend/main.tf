terraform {
  required_version = ">= 0.12"
  backend "s3" {
    # Set in Garden config
    bucket = ""
    key = ""
    region = ""
  }
}

resource "null_resource" "say-hello" {
  provisioner "local-exec" {
    command = "echo 'Hello from Terraform'"
  }
}

