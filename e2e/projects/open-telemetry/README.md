# open-telemetry

A small e2e smoke test setup to ensure that the Open Telemetry collector setup works correctly.
It configures an otlp-http exporter, the receiving server for which is spawned in a `kubernetes-exec` test.
It does not inspect the actual payloads since those can change over time, but checks that requests arrive and send a preconfigured header.
Once such a message has been seen, it considers the test as successful.
