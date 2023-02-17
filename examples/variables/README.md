# Variables

This variant of the basic [demo project](../demo-project/README.md) demonstrate the use of variables with Garden.

## Project variables

In this example, we set a project variable in the [project config](./garden.yml#L5) called `service-replicas` and
reference that variable in the action configs[[1](./backend/garden.yml#L23), [2](./frontend/garden.yml#L14)], in this case to set the number of replicas per service.

We also show how you can alternate these variables by the environment you're running, by overriding the default value
in the `local` environment. In this case, we only want _one_ replica of each service while developing locally, but
default to three when deploying remotely.

## Using variables with templating

Also in the [backend deploy action configuration](./backend/garden.yml#L12) two variables are used to store ports configuration for the service and a variable
is additionally used to detect sync being enabled. Later in the [service ports configuration](./backend/garden.yml#L24) the variables are dynamically used to enable the development port if sync is being used.

You can read more about Garden string templating functionalities [here](../../docs/reference/template-strings/).
