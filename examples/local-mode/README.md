# Local mode for `container` action type

A very basic demo project for Garden local mode for `container` build type.

This project is based on the [demo-project](../demo-project). The only difference is that this one has 2 backend
services. Each backend service (or both) can be started in the _local mode_.

There are 2 local service implementations available for each backend:

1. [backend-local-1](./backend-local-1)
2. [backend-local-2](./backend-local-2)

Each local backend application has its own `garden.yml` config that defines a single `Run` action to compile the binary
of the local app. Each `Deploy` action defined in the [backend-1](./backend-1/garden.yml)
and [backend-2](./backend-2/garden.yml) depends on the corresponding `Run` action of the `backend-local-1`
and `backend-local-2` when deployment is running in local mode.

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

To verify the result, call the corresponding ingress URLs of the `frontend` and `backend` applications. The local
backend implementations return different messages in responses.

## Limitations

A service that calls some other services may not work properly in local mode.

In this example, the [frontend](./frontend) service can be configured and deployed in local mode. Calls to
its `/hello-frontend` will be handled by the locally deployed service with no troubles.

But, calls to `/call-backend-1` or `/call-backend-2` endpoints will fail with an error message like "Unable to reach
service at `http://backend-1/hello-backend-1`". This will happen because the locally deployed service is not aware of
the DNS names `backend-1` and `backend-2` which are configured inside the k8s cluster.

This can be fixed by using the exact DNS names of ingresses instead of k8s DNS names in
the [application code](./frontend/app.js).
