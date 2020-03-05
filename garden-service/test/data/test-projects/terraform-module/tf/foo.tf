variable "my-variable" {
  type = "string"
}

resource "local_file" "test-file" {
  content  = var.my-variable
  filename = "${path.module}/test.log" # using .log extension so that it's ignored by git
}

output "test-file-path" {
  value = "${local_file.test-file.filename}"
}

output "my-output" {
  value = "input: ${var.my-variable}"
}