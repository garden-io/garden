# hadolint project

A simple variation on the [demo-project](../demo-project/README.md) that adds the [hadolint provider](https://docs.garden.io/providers/hadolint). This generates an additional Dockerfile linting test for each `container` module in your project that contains a Dockerfile.

To test it, run `garden dev` in this directory, and wait for the initial processing to complete. Notice the two tests that are added and run by the `hadolint` provider.

Now try editing `backend/Dockerfile`, adding the line `MAINTAINER me@myself.com`. You should quickly see a linting error in your console, telling you that the `MAINTAINER` field is deprecated.
