# Local mode for `kubernetes` action type

A very basic demo project for Garden local mode for `kubernetes` action type.

This project is based on the [demo-project](../demo-project). The only difference is that this one has the `backend`
service defined as an action of type `kubernetes` with the `backend-image` container build action used as a source
Docker image. The backend service can be started in the _local mode_.

The local backend service implementation can be found in [backend-local](./backend-local).
The `backend-local` application has its own `garden.yml` config that defines a single `Run` action to compile the
application binary. The `Deploy` action defined in the [backend](./backend/garden.yml) depends on the `Run` action of
the `backend-local` when deployment is running in local mode.

To start the backend in local mode, try the following commands:

```shell
# To start a specific service in local mode
garden deploy --local=backend

# To start both services in local mode
garden deploy --local
garden deploy --local=*
```

To verify the result, call the corresponding ingress URLs of the `frontend` and `backend` applications. The local
backend implementation returns a different message in a response.
