# Glossary

#### Environment
Represents the current configuration and status of any running services in the [project](#project), which may be
inspected and modified via the Garden CLI's `environment` command.

Several named environment configurations may be defined (e.g. _dev_, _testing_, ...) in the [project's
`garden.yml`](../using-garden/configuration-files.md#project-configuration).

#### Module
The basic unit of configuration in Garden. A module is defined by its
[`garden.yml` configuration file](./config-files-reference.md), located in the module's top-level
directory,
which
is a subdirectory of the [project](#project) repository's top-level directory.

Each module has a plugin type, and may define one or more [services](#service).

Essentially, a project is organized into modules at the granularity of its *build* steps. A module's build step may
depend on one or more other modules having already been built, as specified in its `garden.yml`, in which case those modules will be built
first, and their build output made available to the requiring module's build step.

#### Provider
A [module's](#module) plugin type defines its behavior when it is built, deployed, run and tested. Currently, `container` (for "standard" containerized services) and `openfaas` (for serverless functions) are the only stable plugin types.

#### Project
The top-level unit of organization in Garden. A project consists of one or more [modules](#module), along with a
project-level [`garden.yml` configuration file](./config-files-reference.md).

Garden CLI commands are run in the context of a project, and are aware of all its modules and services.

#### Provider
An implementation of a plugin type (e.g. `local-kubernetes` for the `container` plugin).

#### Service
The unit of deployment in Garden. Services are defined in their parent [module](#module)'s `garden.yml`, each
exposing [one or more ingress endpoints](./config-files-reference.md#container).

Services may depend on services defined in other modules, in which case those services will be deployed first, and
their deployment output made available to the requiring service's deploy step.
