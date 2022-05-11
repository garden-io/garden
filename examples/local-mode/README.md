# Local mode

A very basic demo project for Garden [local mode](../../docs/guides/running-service-in-local-mode.md).

This project is based on the [demo-project](../demo-project). The only difference is that this one has 2 backend
services. Each backend service (or both) can be started in the _local mode_.

There are 2 local service implementations for each backend:

1. [backend-local-1](./backend-local-1)
2. [backend-local-2](./backend-local-2)

To build and run local backend locate to its directory and run the following commands:

```shell
# optional command to re-generate `main.mod` file
go mod init main
# build binary
go build -o main
# make the binary executable
chmod +x main
# start the app
./main
```

Once the necessary local backends are up, you can try the local mode with the following commands:

```shell
garden deploy --local-mode=backend-1
garden deploy --local-mode=backend-2
garden deploy --local-mode=backend-1,backend-2
```
