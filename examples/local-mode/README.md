# Local mode for `container` modules

A very basic demo project for Garden [local mode](../../docs/guides/running-service-in-local-mode.md) for `container`
module type.

This project is based on the [demo-project](../demo-project). The only difference is that this one has 2 backend
services. Each backend service (or both) can be started in the _local mode_.

There are 2 local service implementations available for each backend:

1. [backend-local-1](./backend-local-1)
2. [backend-local-2](./backend-local-2)

To build the local backend services, locate to each service's directory and run the following commands:

```shell
# optional command to re-generate `main.mod` file
go mod init main
# build binary
go build -o main
# make the binary executable
chmod +x main
```

To start the backend(s) in local mode, try the following commands:

```shell
# To start a specific service in local mode
garden deploy --local=backend-1
garden deploy --local=backend-2

# To start both services in local mode
garden deploy --local=backend-1,backend-2
garden deploy --local
garden deploy --local=*
```

Alternatively, you can also run the local mode using the `garden dev` command:

```shell
# To start a specific service in local mode
garden dev --local=backend-1
garden dev --local=backend-2

# To start both services in local mode
garden dev --local=backend-1,backend-2
garden dev --local
garden dev --local=*
```

To verify the result, call the corresponding ingress URLs of the `frontend` and `backend` applications. The local
backend implementations return different messages in responses.

## Limitations

As it has been described in the [local mode guide](../../docs/guides/running-service-in-local-mode.md), a service that
calls some other services may not work properly in local mode.

In this example, the [frontend](./frontend) service can be configured and deployed in local mode. Calls to
its `/hello-frontend` will be handled by the locally deployed service with no troubles.

But, calls to `/call-backend-1` or `/call-backend-2` endpoints will fail with an error message like "Unable to reach
service at `http://backend-1/hello-backend-1`". This will happen because the locally deployed service is not aware of
the DNS names `backend-1` and `backend-2` which are configured inside the k8s cluster.

This can be fixed by using the exact DNS names of ingresses instead of k8s DNS names in
the [application code](./frontend/app.js).
