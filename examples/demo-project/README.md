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
