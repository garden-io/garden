package main

empty(value) {
  count(value) == 0
}

no_violations {
  empty(deny)
}

no_warnings {
  empty(warn)
}

test_deployment_without_security_context {
  deny["Containers must not run as root in Deployment sample"] with input as {"kind": "Deployment", "metadata": { "name": "sample" }}
}

test_deployment_with_security_context {
  no_violations with input as {"kind": "Deployment", "metadata": {"name": "sample"}, "spec": {
    "selector": { "matchLabels": { "app": "something", "release": "something" }},
    "template": { "spec": { "securityContext": { "runAsNonRoot": true  }}}}}
}

test_services_not_denied {
  no_violations with input as {"kind": "Service", "metadata": { "name": "sample" }}
}

test_services_issue_warning {
  warn["Found service sample but services are not allowed"] with input as {"kind": "Service", "metadata": { "name": "sample" }}
}
