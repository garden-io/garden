# artifacts logging issue repro

This example tries to reproduce issue where garden misses most logs when running tests with artifacts enabled

[garden test definitions](/frontend/garden.yml)
[js test definitions](/frontend/test/unit.test.js)

how to run:
```sh
# with artifacts
GARDEN_LOGGER_TYPE=basic garden test frontend -n with-artifacts

# no artifacts
GARDEN_LOGGER_TYPE=basic garden test frontend -n no-artifacts

# both together
GARDEN_LOGGER_TYPE=basic garden test frontend
```

---

Logs from **with** artifacts run:
```log
Failed running with-artifacts tests in module frontend. Here is the output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Command exited with code 1:

> frontend@1.0.0 test /app
> jest --coverage

FAIL test/unit.test.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 test action(s) failed!

```


Logs from **no** artifacts run:
```log
Failed running no-artifacts tests in module frontend. Here is the output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> frontend@1.0.0 test /app
> jest --coverage

FAIL test/unit.test.js
  all my lovely tests
  console.error
    Error to console

      1 | function printToConsoleInDifferentWays() {
    > 2 |   console.error("Error to console")
        |           ^
      3 |   console.log("Log to console")
      4 |   console.info("info to console")
      5 |   console.warn("warn to console")

      at printToConsoleInDifferentWays (test/unit.test.js:2:11)
      at Object.<anonymous> (test/unit.test.js:63:5)

  console.log
    Log to console

      at printToConsoleInDifferentWays (test/unit.test.js:3:11)

  console.info
    info to console

...
much more logs

```