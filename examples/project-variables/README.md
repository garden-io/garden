# Project variables

This variant of the basic [demo project](../demo-project/README.md) demonstrate the use of project variables.

In this example, we set a project variable in the [project config](./garden.yml) called `service-replicas` and
reference that variable in the module configs, in this case to set the number of replicas per service.

We also show how you can alternate these variables by the environment you're running, by overriding the default value
in the `local` environment. In this case, we only want _one_ replica of each service while developing locally, but
default to three when deploying remotely.
