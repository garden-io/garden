---
order: 30
title: Commands
---

## Garden CLI commands

Below is a list of Garden CLI commands and usage information.

The commands should be run in a Garden project, and are always scoped to that project.

Note: You can get a list of commands in the CLI by running `garden -h/--help`,
and detailed help for each command using `garden <command> -h/--help`

The _Outputs_ sections show the output structure when running the command with `--output yaml`. The same structure is used when `--output json` is used and when querying through the REST API, but in JSON format.

##### Global options

The following option flags can be used with any of the CLI commands:

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--root` |  | path | Override project root directory (defaults to working directory). Can be absolute or relative to current directory.
  | `--env` |  | string | The environment (and optionally namespace) to work against.
  | `--force-refresh` |  | boolean | Force refresh of any caches, e.g. cached provider statuses.
  | `--var` |  | array:string | Set a specific variable value, using the format &lt;key&gt;&#x3D;&lt;value&gt;, e.g. &#x60;--var some-key&#x3D;custom-value&#x60;. This will override any value set in your project configuration. You can specify multiple variables by separating with a comma, e.g. &#x60;--var key-a&#x3D;foo,key-b&#x3D;&quot;value with quotes&quot;&#x60;.
  | `--yes` |  | boolean | Automatically approve any yes/no prompts during execution, and allow running protected commands against production environments.
  | `--silent` |  | boolean | Suppress log output. Same as setting --logger-type&#x3D;quiet.
  | `--offline` |  | boolean | Use the --offline option when you can&#x27;t log in right now. Some features won&#x27;t be available in offline mode.
  | `--logger-type` |  | `quiet` `default` `basic` `json` `ink`  | Set logger type. default The default Garden logger, basic: [DEPRECATED] An alias for &quot;default&quot;. json: Renders log lines as JSON. quiet: Suppresses all log output, same as --silent.
  | `--log-level` |  | `error` `warn` `info` `verbose` `debug` `silly` `0` `1` `2` `3` `4` `5`  | Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5. From the verbose log level onward action execution logs are also printed (e.g. test or run live log outputs).
  | `--output` |  | `json` `yaml`  | Output command result in the specified format. When used, this option disables line-by-line logging, even if the GARDEN_LOGGER_TYPE environment variable is used.
  | `--emoji` |  | boolean | Enable emoji in output (defaults to true if the environment supports it).
  | `--show-timestamps` |  | boolean | Show timestamps with log output. When enabled, Garden will use the basic logger. I.e., log status changes are rendered as new lines instead of being updated in-place.
  | `--version` |  | boolean | Show the current CLI version.
  | `--help` |  | boolean | Show help

### garden build

**Perform your Builds.**

Runs all or specified Builds, taking into account build dependency order.
Optionally stays running and automatically builds when sources (or dependencies' sources) change.

Examples:

    garden build                   # build everything in the project
    garden build my-image          # only build my-image
    garden build image-a image-b   # build image-a and image-b
    garden build --force           # force re-builds, even if builds had already been performed at current version
    garden build -l 3              # build with verbose log level to see the live log output

#### Usage

    garden build [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | Specify Builds to run. You may specify multiple names, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force re-build.
  | `--with-dependants` |  | boolean | Also rebuild any Builds that depend on one of the Builds specified as CLI arguments (recursively). Note: This option has no effect unless a list of Build names is specified as CLI arguments (since otherwise, every Build in the project will be performed anyway).

#### Outputs

```yaml
# Set to true if the command execution was aborted.
aborted:

# Set to false if the command execution was unsuccessful.
success:

# A map of all executed Builds (or Builds scheduled/attempted) and information about them.
build:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about
# them. Please do not use this alias, it will be removed in a future release.
builds:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.
deploy:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy
# status. Please do not use this alias, it will be removed in a future release.
deployments:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all Tests that were executed (or scheduled/attempted) and the Test results.
test:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results.
# Please do not use this alias, it will be removed in a future release.
tests:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all Runs that were executed (or scheduled/attempted) and the Run results.
run:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results.
# Please do not use this alias, it will be removed in a future release.
tasks:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:
```

### garden cloud secrets list

**List secrets defined in Garden Cloud.**

List all secrets from Garden Cloud. Optionally filter on environment, user IDs, or secret names.

Examples:
    garden cloud secrets list                                          # list all secrets
    garden cloud secrets list --filter-envs dev                        # list all secrets from the dev environment
    garden cloud secrets list --filter-envs dev --filter-names *_DB_*  # list all secrets from the dev environment that have '_DB_' in their name.

#### Usage

    garden cloud secrets list [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--filter-envs` |  | array:string | Filter on environment. You may filter on multiple environments by setting this flag multiple times. Accepts glob patterns.&quot;
  | `--filter-user-ids` |  | array:string | Filter on user ID. You may filter on multiple user IDs by setting this flag multiple times. Accepts glob patterns.
  | `--filter-names` |  | array:string | Filter on secret name. You may filter on multiple secret names by setting this flag multiple times. Accepts glob patterns.


### garden cloud secrets create

**Create secrets in Garden Cloud.**

Create secrets in Garden Cloud. You can create project wide secrets or optionally scope
them to an environment, or an environment and a user.

To scope secrets to a user, you will need the user's ID which you can get from the
`garden cloud users list` command.

You can optionally read the secrets from a file.

Examples:
    garden cloud secrets create DB_PASSWORD=my-pwd ACCESS_KEY=my-key   # create two secrets
    garden cloud secrets create ACCESS_KEY=my-key --scope-to-env ci    # create a secret and scope it to the ci environment
    garden cloud secrets create ACCESS_KEY=my-key --scope-to-env ci --scope-to-user 9  # create a secret and scope it to the ci environment and user with ID 9
    garden cloud secrets create --from-file /path/to/secrets.txt  # create secrets from the key value pairs in the secrets.txt file

#### Usage

    garden cloud secrets create [secrets] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `secrets` | No | The names and values of the secrets to create, separated by &#x27;&#x3D;&#x27;. You may specify multiple secret name/value pairs, separated by spaces. Note that you can also leave this empty and have Garden read the secrets from file.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--scope-to-user-id` |  | string | Scope the secret to a user with the given ID. User scoped secrets must be scoped to an environment as well.
  | `--scope-to-env` |  | string | Scope the secret to an environment. Note that this does not default to the environment that the command runs in (i.e. the one set via the --env flag) and that you need to set this explicitly if you want to create an environment scoped secret.
  | `--from-file` |  | path | Read the secrets from the file at the given path. The file should have standard &quot;dotenv&quot; format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).


### garden cloud secrets update

**Update secrets in Garden Cloud**

Update secrets in Garden Cloud. You can update the secrets by either specifying secret name or secret ID.

By default, the secrets are updated by name instead of secret ID.

When updating by name, only the existing secrets are updated by default.
The missing ones are skipped and reported as errors at the end of the command execution.
This behavior can be customized with the `--upsert` flag, so the missing secrets will be created.

If you have multiple secrets with same name across different environments and users, specify the environment and the user id using `--scope-to-env` and `--scope-to-user-id` flags.
Otherwise, the command will fail with an error.

To update the secrets by their IDs, use the `--update-by-id` flag.
To get the IDs of the secrets you want to update, run the `garden cloud secrets list` command.
The `--upsert` flag has no effect if it's used along with the `--update-by-id` flag.

Examples:
    garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar # update two secret values with the given names.
    garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar --upsert # update two secret values with the given names and create new ones if any are missing
    garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar --scope-to-env local --scope-to-user-id <user-id> # update two secret values with the given names for the environment local and specified user id.
    garden cloud secrets update <ID 1>=foo <ID 2>=bar --update-by-id # update two secret values with the given IDs.

#### Usage

    garden cloud secrets update [secretNamesOrIds] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `secretNamesOrIds` | No | The names and values of the secrets to update, separated by &#x27;&#x3D;&#x27;. You may specify multiple secret name/value pairs, separated by spaces. You can also pass pairs of secret IDs and values if you use &#x60;--update-by-id&#x60; flag. Note that you can also leave this empty and have Garden read the secrets from file.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--upsert` |  | boolean | Set this flag to upsert secrets instead of only updating them. It means that the existing secrets will be updated while the missing secrets will be created. This flag works only while updating secrets by name, and has no effect with &#x60;--update-by-id&#x60; option.
  | `--update-by-id` |  | boolean | Update secret(s) by secret ID(s). By default, the command args are considered to be secret name(s). The &#x60;--upsert&#x60; flag has no effect with this option.
  | `--from-file` |  | path | Read the secrets from the file at the given path. The file should have standard &quot;dotenv&quot; format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
  | `--scope-to-user-id` |  | string | Update the secret(s) in scope of user with the given user ID. This must be specified if you want to update secrets by name instead of secret ID.
  | `--scope-to-env` |  | string | Update the secret(s) in scope of the specified environment. This must be specified if you want to update secrets by name instead of secret ID.


### garden cloud secrets delete

**Delete secrets from Garden Cloud.**

Delete secrets in Garden Cloud. You will need the IDs of the secrets you want to delete,
which you which you can get from the `garden cloud secrets list` command.

Examples:
    garden cloud secrets delete <ID 1> <ID 2> <ID 3>   # delete three secrets with the given IDs.

#### Usage

    garden cloud secrets delete [ids] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `ids` | No | The ID(s) of the secrets to delete.



### garden cloud users list

**List users defined in Garden Cloud.**

List all users from Garden Cloud. Optionally filter on group names or user names.

Examples:
    garden cloud users list                            # list all users
    garden cloud users list --filter-names Gordon*     # list all the Gordons in Garden Cloud. Useful if you have a lot of Gordons.
    garden cloud users list --filter-groups devs-*     # list all users in groups that with names that start with 'dev-'

#### Usage

    garden cloud users list [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--filter-names` |  | array:string | Filter on user name. You may filter on multiple names by setting this flag multiple times. Accepts glob patterns.
  | `--filter-groups` |  | array:string | Filter on the groups the user belongs to. You may filter on multiple groups by setting this flag multiple times. Accepts glob patterns.


### garden cloud users create

**Create users in Garden Cloud.**

Create users in Garden Cloud and optionally add the users to specific groups.
You can get the group IDs from the `garden cloud users list` command.

To create a user, you'll need their GitHub or GitLab username, depending on which one is your VCS provider, and the name
they should have in Garden Cloud. Note that it **must** the their GitHub/GitLab username, not their email, as people
can have several emails tied to their GitHub/GitLab accounts.

You can optionally read the users from a file. The file must have the format vcs-username="Actual Username". For example:

fatema_m="Fatema M"
gordon99="Gordon G"

Examples:
    garden cloud users create fatema_m="Fatema M" gordon99="Gordon G"  # create two users
    garden cloud users create fatema_m="Fatema M" --add-to-groups 1,2  # create a user and add two groups with IDs 1,2
    garden cloud users create --from-file /path/to/users.txt           # create users from the key value pairs in the users.txt file

#### Usage

    garden cloud users create [users] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `users` | No | The VCS usernames and the names of the users to create, separated by &#x27;&#x3D;&#x27;. You may specify multiple VCS username/name pairs, separated by spaces. Note that you can also leave this empty and have Garden read the users from file.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--add-to-groups` |  | array:string | Add the user to the group with the given ID. You may add the user to multiple groups by setting this flag multiple times.
  | `--from-file` |  | path | Read the users from the file at the given path. The file should have standard &quot;dotenv&quot; format (as defined by [dotenv](https://github.com/motdotla/dotenv#rules)) where the VCS username is the key and the name is the value.


### garden cloud users delete

**Delete users from Garden Cloud.**

Delete users in Garden Cloud. You will need the IDs of the users you want to delete,
which you which you can get from the `garden cloud users list` command. Use a comma-
separated list to delete multiple users.

Examples:
    garden cloud users delete <ID 1> <ID 2> <ID 3>   # delete three users with the given IDs.

#### Usage

    garden cloud users delete [ids] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `ids` | No | The IDs of the users to delete.



### garden cloud groups list

**List groups defined in Garden Cloud.**

List all groups from Garden Cloud. This is useful for getting the group IDs when creating
users via the `garden cloud users create` command.

Examples:
    garden cloud groups list                       # list all groups
    garden cloud groups list --filter-names dev-*  # list all groups that start with 'dev-'

#### Usage

    garden cloud groups list [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--filter-names` |  | array:string | Filter on group name. You may filter on multiple names by setting this flag multiple times. Accepts glob patterns.


### garden community

**Checkout Garden Discussions on GitHub to chat with us!**

Opens the Garden Discussions page.

#### Usage

    garden community 



### garden config analytics-enabled

**Update your preferences regarding analytics.**

To help us make Garden better, we collect some analytics data about its usage.
We make sure all the data collected is anonymized and stripped of sensitive
information. We collect data about which commands are run, what tasks they trigger,
which API calls are made to your local Garden server, as well as some info
about the environment in which Garden runs.

You will be asked if you want to opt out when running Garden for the
first time and you can use this command to update your preferences later.

Examples:

    garden config analytics-enabled true   # enable analytics
    garden config analytics-enabled false  # disable analytics

#### Usage

    garden config analytics-enabled [enable] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `enable` | No | Enable analytics. Defaults to &quot;true&quot;



### garden create project

**Create a new Garden project.**

Creates a new Garden project configuration. The generated config includes some default values, as well as the
schema of the config in the form of commented-out fields. Also creates a default (blank) .gardenignore file
in the same path.

Examples:

    garden create project                     # create a Garden project config in the current directory
    garden create project --dir some-dir      # create a Garden project config in the ./some-dir directory
    garden create project --name my-project   # set the project name to my-project
    garden create project --interactive=false # don't prompt for user inputs when creating the config

#### Usage

    garden create project [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dir` |  | path | Directory to place the project in (defaults to current directory).
  | `--filename` |  | string | Filename to place the project config in (defaults to project.garden.yml).
  | `--interactive` |  | boolean | Set to false to disable interactive prompts.
  | `--name` |  | string | Name of the project (defaults to current directory name).


### garden create remote-variables

**Create remote variables in Garden Cloud.**

Create or update remote variables in Garden Cloud. Variables belong to variable lists, which you can get via the
`garden get variable-lists` command, and can optionally be scoped to an environment,
or an environment and a user. The variable lists themselves are also created in Garden Cloud.

To scope variables to a user, you will need the user's ID which you can get from the
`garden get users` command.

To update existing variables if they exist (i.e. use an upsert), pass the --upsert flag. The default behaviour
(i.e. when not upserting) is to fail if a variable with the same name already exists in the variable list.

You can optionally read the variables from a .env formatted file using --from-file.

Examples:
    garden create remote-variables varlist_123 DB_PASSWORD=my-pwd ACCESS_KEY=my-key   # create two variables
    garden create remote-variables varlist_123 DB_PASSWORD=my-pwd ACCESS_KEY=my-key --upsert  # create two variables and upsert if they already exist
    garden create remote-variables varlist_123 ACCESS_KEY=my-key --scope-to-env ci    # create a variable and scope it to the ci environment
    garden create remote-variables varlist_123 ACCESS_KEY=my-key --scope-to-env ci --scope-to-user <user-id>  # create a variable and scope it to the ci environment and user
    garden create remote-variables varlist_123 --from-file /path/to/variables.env  # create variables from the key value pairs in the variables.env file
    garden create remote-variables varlist_123 SECRET_KEY=my-secret --secret=false  # create a non-secret variable

See the [Variables and Templating guide](https://docs.garden.io/cedar-0.14/features/variables-and-templating) for more information.

#### Usage

    garden create remote-variables [variable-list-id] [variables] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `variable-list-id` | No | The ID of the variable list to create the variables in. You can use the &#x60;garden get variable-list&#x60; to
look up the variable list IDs.
  | `variables` | No | The names and values of the variables to create, separated by &#x27;&#x3D;&#x27;. You may specify multiple
variable name/value pairs, separated by spaces. Note that you can also leave this empty
and have Garden read the variables from file.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--scope-to-user-id` |  | string | Scope the variable to a user with the given ID. User scoped variables must be scoped to an environment as well.
  | `--scope-to-env` |  | string | Scope the variable to an environment. Note that this does not default to the environment
that the command runs in (i.e. the one set via the --env flag) and that you need to set this explicitly if
you want to create an environment scoped variable.
  | `--from-file` |  | path | Read the variables from the file at the given path. The file should have standard &quot;dotenv&quot;
format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
  | `--secret` |  | boolean | Store the variable as an encrypted secret. Defaults to true.
  | `--upsert` |  | boolean | Update the variable if it already exists. Defaults to false.
  | `--description` |  | string | Description for the variable.
  | `--expires-at` |  | string | ISO 8601 date string for when the variable expires.

#### Outputs

```yaml
# A list of created variables
variables:
  - id:

    name:

    value:

    description:

    isSecret:

    expiresAt:

    scopedAccountId:

    environmentName:

    # Whether an existing variable was replaced (only relevant when upserting)
    replacedPrevious:
```

### garden cleanup namespace

**Deletes a running namespace.**

This will clean up everything deployed in the specified environment, and trigger providers to clear up any other resources
and reset it. When you then run `garden deploy` after, the namespace will be reconfigured.

This can be useful if you find the namespace to be in an inconsistent state, or need/want to free up resources.

Deploys with `removeOnCleanup: false` set in their configuration are skipped by default. Use the `--force` flag to
override this and clean up all deploys regardless.

#### Usage

    garden cleanup namespace [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dependants-first` |  | boolean | Clean up Deploy(s) (or services if using modules) in reverse dependency order. That is, if service-a has a dependency on service-b, service-a will be deleted before service-b when calling &#x60;garden cleanup namespace service-a,service-b --dependants-first&#x60;.

When this flag is not used, all services in the project are cleaned up simultaneously.
  | `--force` |  | boolean | Force cleanup/deletion of Deploy(s) that have &#x60;removeOnCleanup: false&#x60; set in their configuration. By default, such deploys are skipped during cleanup.

#### Outputs

```yaml
# The status of each provider in the namespace.
providerStatuses:
  # Description of an environment's status for a provider.
  <name>:
    # Set to true if the environment is fully configured for a provider.
    ready:

    # Use this to include additional information that is specific to the provider.
    detail:

    # Output variables that modules and other variables can reference.
    outputs:
      <name>:

    # Set to true to disable caching of the status.
    disableCache:

# The status of each deployment in the namespace.
deployStatuses:
  <name>:
    # The state of the action.
    state:

    # Structured outputs from the execution, as defined by individual action/module types, to be made available for
    # dependencies and in templating.
    outputs:
      <name>:

    # Set to true if the action handler is running a process persistently and attached to the Garden process after
    # returning.
    attached:

    detail:
      # When the service was first deployed by the provider.
      createdAt:

      # Additional detail, specific to the provider.
      detail:

      # The mode the action is deployed in.
      mode:

      # The ID used for the service by the provider (if not the same as the service name).
      externalId:

      # The provider version of the deployed service (if different from the Garden module version.
      externalVersion:

      # A list of ports that can be forwarded to from the Garden agent by the provider.
      forwardablePorts:
        - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
          name:

          # The preferred local port to use for forwarding.
          preferredLocalPort:

          # The protocol of the port.
          protocol:

          # The target name/hostname to forward to (defaults to the service name).
          targetName:

          # The target port on the service.
          targetPort:

          # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
          urlProtocol:

      # List of currently deployed ingress endpoints for the service.
      ingresses:
        - # The port number that the service is exposed on internally.
          # This defaults to the first specified port for the service.
          port:

          # The ingress path that should be matched to route to this service.
          path:

          # The protocol to use for the ingress.
          protocol:

          # The hostname where the service can be accessed.
          hostname:

      # Latest status message of the service (if any).
      lastMessage:

      # Latest error status message of the service (if any).
      lastError:

      # A map of values output from the deployment.
      outputs:
        <name>:

      # How many replicas of the service are currently running.
      runningReplicas:

      # The current deployment status of the service.
      state:

      # When the service was last updated by the provider.
      updatedAt:

      # The Garden module version of the deployed service.
      version:
```

### garden cleanup deploy

**Cleans up running deployments (or services if using modules).**

Cleans up (i.e. un-deploys) the specified actions. Cleans up all deploys/services in the project if no arguments are provided.
Note that this command does not take into account any deploys depending on the cleaned up actions, and might
therefore leave the project in an unstable state. Running `garden deploy` after will re-deploy anything missing.

Deploys with `removeOnCleanup: false` set in their configuration are skipped by default. Use the `--force` flag to
override this and clean up all deploys/services regardless.

Examples:

    garden cleanup deploy my-service # deletes my-service
    garden cleanup deploy            # deletes all deployed services in the project
    garden cleanup deploy --force    # deletes all deployed services, including those with removeOnCleanup: false

#### Usage

    garden cleanup deploy [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the deploy(s) (or services if using modules) to delete. You may specify multiple names, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dependants-first` |  | boolean | Clean up Deploy(s) (or services if using modules) in reverse dependency order. That is, if service-a has a dependency on service-b, service-a will be deleted before service-b when calling &#x60;garden cleanup namespace service-a,service-b --dependants-first&#x60;.

When this flag is not used, all services in the project are cleaned up simultaneously.
  | `--force` |  | boolean | Force cleanup/deletion of Deploy(s) that have &#x60;removeOnCleanup: false&#x60; set in their configuration. By default, such deploys are skipped during cleanup.
  | `--with-dependants` |  | boolean | Also clean up deployments/services that have dependencies on one of the deployments/services specified as CLI arguments (recursively).  When used, this option implies --dependants-first. Note: This option has no effect unless a list of names is specified as CLI arguments (since then, every deploy/service in the project will be deleted).

#### Outputs

```yaml
<name>:
  # The state of the action.
  state:

  # Structured outputs from the execution, as defined by individual action/module types, to be made available for
  # dependencies and in templating.
  outputs:
    <name>:

  # Set to true if the action handler is running a process persistently and attached to the Garden process after
  # returning.
  attached:

  detail:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the deployment.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # The Garden module version of the deployed service.
    version:

  version:
```

### garden cleanup remote-variables

**Delete remote variables from Garden Cloud.**

Delete remote variables in Garden Cloud. You will need the IDs of the variables you want to delete,
which you can get from the `garden get remote-variables` command.

Examples:
    garden delete remote-variables <ID 1> <ID 2> <ID 3>   # delete the remote variables with the given IDs.

#### Usage

    garden cleanup remote-variables [ids] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `ids` | No | The ID(s) of the cloud variables to delete.


#### Outputs

```yaml
# A list of deleted variables
variables:
  - id:

    success:
```

### garden deploy

**Deploy actions to your environment.**

Deploys all or specified Deploy actions, taking into account dependency order.
Also performs builds and other dependencies if needed.

Optionally stays running and automatically re-builds and re-deploys if sources
(or dependencies' sources) change.

Examples:

    garden deploy                      # deploy everything in the project
    garden deploy my-deploy            # only deploy my-deploy
    garden deploy deploy-a,deploy-b    # only deploy deploy-a and deploy-b
    garden deploy --force              # force re-deploy, even for deploys already deployed and up-to-date
    garden deploy --sync=my-deploy     # deploys all Deploys, with sync enabled for my-deploy
    garden deploy --sync               # deploys all compatible Deploys with sync enabled
    garden deploy --env stage          # deploy your Deploys to an environment called stage
    garden deploy --skip deploy-b      # deploy everything except deploy-b
    garden deploy --forward            # deploy everything and start port forwards without sync or local mode
    garden deploy my-deploy --logs     # deploy my-deploy and follow the log output from the deployed service
    garden deploy my-deploy -l 3       # deploy with verbose log level to see logs of the creation of the deployment
    garden deploy --plan               # show what would be deployed without making any changes
    garden deploy my-deploy --plan     # show what deploying my-deploy would do

#### Usage

    garden deploy [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the Deploy(s) (or services if using modules) to deploy (skip to deploy everything). You may specify multiple names, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force re-deploy.
  | `--force-build` |  | boolean | Force re-build of build dependencies.
  | `--plan` |  | boolean | [EXPERIMENTAL] Show what would be deployed without actually deploying anything.
This will run the plan handler for each Deploy action, showing the changes that would be made.
  | `--sync` |  | array:string | The name(s) of the Deploy(s) to deploy with sync enabled.
You may specify multiple names by setting this flag multiple times.
Use * to deploy all supported deployments with sync enabled.

Important: The syncs stay active after the command exits. To stop the syncs, use the &#x60;sync stop&#x60; command.
  | `--skip` |  | array:string | The name(s) of Deploys you&#x27;d like to skip.
  | `--skip-dependencies` |  | boolean | Skip deploy, test and run dependencies. Build dependencies and runtime output reference dependencies are not skipped. This can be useful e.g. when your stack has already been deployed, and you want to run specific Deploys in sync mode without deploying or running dependencies that may have changed since you last deployed.
  | `--with-dependants` |  | boolean | Additionally deploy all deploy actions that are downstream dependants of the action(s) being deployed. This can be useful when you know you need to redeploy dependants.
  | `--disable-port-forwards` |  | boolean | Disable automatic port forwarding when running persistently. Note that you can also set GARDEN_DISABLE_PORT_FORWARDS&#x3D;true in your environment.
  | `--forward` |  | boolean | Create port forwards and leave process running after deploying. This is implied if any of --sync / --local or --logs are set.
  | `--logs` |  | boolean | Stream logs from the requested Deploy(s) (or services if using modules) during deployment, and leave the log streaming process running after deploying. Note: This option implies the --forward option.
  | `--timestamps` |  | boolean | Show timestamps with log output. Should be used with the &#x60;--logs&#x60; option (has no effect if that option is not used).
  | `--port` |  | number | The port number for the server to listen on (defaults to 9777 if available).

#### Outputs

```yaml
# Set to true if the command execution was aborted.
aborted:

# Set to false if the command execution was unsuccessful.
success:

# A map of all executed Builds (or Builds scheduled/attempted) and information about them.
build:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about
# them. Please do not use this alias, it will be removed in a future release.
builds:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.
deploy:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy
# status. Please do not use this alias, it will be removed in a future release.
deployments:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all Tests that were executed (or scheduled/attempted) and the Test results.
test:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results.
# Please do not use this alias, it will be removed in a future release.
tests:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all Runs that were executed (or scheduled/attempted) and the Run results.
run:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results.
# Please do not use this alias, it will be removed in a future release.
tasks:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:
```

### garden diff

**[EXPERIMENTAL] Compare the current working directory Garden project with the specified branch or commit.**

**[EXPERIMENTAL] This command is still under development and may change in the future, including parameters and output format.**

Compare the current working directory Garden project with the specified branch/commit, or with other differences (all specified via `--b-X` flags).

Use this to understand the impact of your changes on action versions.

In the output, "A" (e.g. "version A") refers to the current working directory project, and "B" refers to the project at the specified branch or commit. When something is reported as "added" (such as an action, file, new lines in a config etc.), it means it's present in the current project but not in the comparison project. Similarly, "removed" means it's present in the comparison project but not in the current project.

The different `--b-X` flags define the comparison project (B). At least one of these flags must be specified, and they can be combined in any number of ways.

When setting the `--b-X` flags, the values will be overridden in the comparison project (B). If you want to change variables or set a different environment in the _current_ project (A), you can use the normal `--var`, `--env` etc. flags. For example, if you want to test the impact of overriding a variable value for both sides, you can use the `--var` flag to override the value in the current project (A), and then use the `--b-var` flag to override the value in the comparison project (B), e.g. `--b-var some-var=foo --var some-var=bar`.

In most cases you should use this with the `--resolve` flag to ensure that the comparison is complete, but take caution as it may result in actions being executed during resolution (e.g. if a runtime output is referenced by another action, it will be executed in order to fully resolve the config). In such cases, you may want to avoid this option or use the `--action` flag to only diff specific actions.

Examples:
# compare the current default environment to the ci environment (assuming one is defined in the project configuration)
garden diff --b-env ci
# compare the current default environment to the ci environment and fully resolve values for a complete comparison (note that this may trigger actions being executed)
garden diff --b-env ci --resolve
# compare the staging env to the ci env
garden diff --env staging --b-env ci
# compare the current branch to other-branch (using the default environment in both cases)
garden diff --b-branch other-branch
# compare the current branch's default environment to other-branch's ci environment
garden diff --b-branch other-branch --b-env ci
# compare the resolved api Build action between the default environment and ci
garden diff --b-env ci --action build.api --resolve
# compare the current default environment to the ci environment and override the HOSTNAME variable in the ci environment
garden diff --b-env ci --b-var HOSTNAME=remote.acme
# compare the current default environment to the ci environment and override the HOSTNAME variable in both environments
garden diff --var HOSTNAME=local.acme --b-env ci --b-var HOSTNAME=remote.acme

#### Usage

    garden diff [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--b-commit` |  | string | Check out the specified commit in the comparison project (B).
  | `--b-branch` |  | string | Check out the specified branch in the comparison project (B).
  | `--b-env` |  | string | Override the Garden environment for the comparison project (B).
  | `--b-local-env-var` |  | array:tag | Override a local environment variable in the comparison project (B), as templated using ${local.env.*}, with the specified value. This should be formatted as &lt;VAR_NAME&gt;:&lt;VALUE&gt;, e.g. &quot;MY_VAR&#x3D;my-value&quot;. You can specify multiple variables by repeating the flag.
  | `--b-var` |  | array:tag | Override a Garden variable in the comparison project (B) with the specified value, formatted as &lt;VAR_NAME&gt;:&lt;VALUE&gt;, e.g. &quot;MY_VAR&#x3D;my-value&quot;. Analogous to the --var global flag in the Garden CLI. You can specify multiple variables by repeating the flag.
  | `--resolve` |  | boolean | Fully resolve each action before comparing. Note that this may result in actions being executed during resolution (e.g. if a runtime output is referenced by another action, it will be executed in order to fully resolve the config). In such cases, you may want to avoid this option or use the --action flag to only diff specific actions.
  | `--action` |  | array:string | Specify an action to diff, as &lt;kind&gt;.&lt;name&gt;. Can be specified multiple times. If none is specified, all actions will be compared.


### garden exec

**Executes a command (such as an interactive shell) in a running service.**

Finds an active container for a deployed Deploy and executes the given command within the container.
Supports interactive shells.
You can specify the command to run as a parameter, or pass it after a `--` separator. For commands
with arguments or quoted substrings, use the `--` separator.

_NOTE: This command may not be supported for all action types. The use of the positional command argument
is deprecated. Use  `--` followed by your command instead._

Examples:

     garden exec my-service /bin/sh   # runs an interactive shell in the my-service Deploy's container
     garden exec my-service -- /bin/sh -c echo "hello world" # prints "hello world" in the my-service Deploy's container and exits

#### Usage

    garden exec <deploy> [command] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `deploy` | Yes | The running Deploy action to exec the command in.
  | `command` | No | The use of the positional command argument is deprecated. Use  &#x60;--&#x60; followed by your command instead.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result
  | `--target` |  | string | Specify name of the target if a Deploy action consists of multiple components. _NOTE: This option is only relevant in certain scenarios and will be ignored otherwise._ For Kubernetes deploy actions, this is useful if a Deployment includes multiple containers, such as sidecar containers. By default, the container with &#x60;kubectl.kubernetes.io/default-container&#x60; annotation or the first container is picked.

#### Outputs

```yaml
# The exit code of the command executed.
code:

# The output of the executed command.
output:

# The stdout output of the executed command (if available).
stdout:

# The stderr output of the executed command (if available).
stderr:
```

### garden get graph

**Outputs the dependency relationships across the project.**


#### Usage

    garden get graph 



### garden get config

**Outputs the full configuration for this project and environment.**


#### Usage

    garden get config [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--exclude-disabled` |  | boolean | Exclude disabled action and module configs from output.
  | `--resolve` |  | `full` `partial`  | Choose level of resolution of config templates. Defaults to full. Specify --resolve&#x3D;partial to avoid resolving providers.

#### Outputs

```yaml
allEnvironmentNames:

# A list of all plugins available to be used in the provider configuration.
allAvailablePlugins:

# The name of the environment.
environmentName:

# The namespace of the current environment (if applicable).
namespace:

# A list of all configured providers in the environment.
providers:
  - # The name of the provider plugin to use.
    name:

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    preInit:
      # A script to run before the provider is initialized. This is useful for performing any provider-specific setup
      # outside of Garden. For example, you can use this to perform authentication, such as authenticating with a
      # Kubernetes cluster provider.
      # The script will always be run from the project root directory.
      # Note that provider statuses are cached, so this script will generally only be run once, but you can force a
      # re-run by setting `--force-refresh` on any Garden command that uses the provider.
      runScript:

    # Map of all the providers that this provider depends on.
    dependencies:
      <name>:

    config:
      # The name of the provider plugin to use.
      name:

      # List other providers that should be resolved before this one.
      dependencies:

      # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
      # disables the provider. To use a provider in all environments, omit this field.
      environments:

      preInit:
        # A script to run before the provider is initialized. This is useful for performing any provider-specific
        # setup outside of Garden. For example, you can use this to perform authentication, such as authenticating
        # with a Kubernetes cluster provider.
        # The script will always be run from the project root directory.
        # Note that provider statuses are cached, so this script will generally only be run once, but you can force a
        # re-run by setting `--force-refresh` on any Garden command that uses the provider.
        runScript:

    moduleConfigs:
      - kind:

        # The type of this module.
        type:

        # The name of this module.
        name:

        # Specify how to build the module. Note that plugins may define additional keys on this object.
        build:
          # A list of modules that must be built before this module is built.
          dependencies:
            - # Module name to build ahead of this module.
              name:

              # Specify one or more files or directories to copy from the built dependency to this module.
              copy:
                - # POSIX-style path or filename of the directory or file(s) to copy to the target.
                  source:

                  # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
                  # Defaults to the same as source path.
                  target:

          # Maximum time in seconds to wait for build to finish.
          timeout:

        # If set to true, Garden will run the build command, services, tests, and tasks in the module source
        # directory,
        # instead of in the Garden build directory (under .garden/build/<module-name>).
        #
        # Garden will therefore not stage the build for local modules. This means that include/exclude filters
        # and ignore files are not applied to local modules, except to calculate the module/action versions.
        #
        # If you use use `build.dependencies[].copy` for one or more build dependencies of this module, the copied
        # files
        # will be copied to the module source directory (instead of the build directory, as is the default case when
        # `local = false`).
        #
        # Note: This maps to the `buildAtSource` option in this module's generated Build action (if any).
        local:

        # A description of the module.
        description:

        # Set this to `true` to disable the module. You can use this with conditional template strings to disable
        # modules based on, for example, the current environment or other variables (e.g. `disabled:
        # ${environment.name == "prod"}`). This can be handy when you only need certain modules for specific
        # environments, e.g. only for development.
        #
        # Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or
        # run.
        #
        # If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
        # will automatically ignore those dependency declarations. Note however that template strings referencing the
        # module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so
        # you need to make sure to provide alternate values for those if you're using them, using conditional
        # expressions.
        disabled:

        # Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module.
        # Files that do *not* match these paths or globs are excluded when computing the version of the module, when
        # responding to filesystem watch events, and when staging builds.
        #
        # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
        # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
        # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
        # for details.
        #
        # Also note that specifying an empty list here means _no sources_ should be included.
        include:

        # Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
        # match these paths or globs are excluded when computing the version of the module, when responding to
        # filesystem watch events, and when staging builds.
        #
        # Note that you can also explicitly _include_ files using the `include` field. If you also specify the
        # `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
        # [Configuration Files
        # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
        # for details.
        #
        # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
        # directories are watched for changes. Use the project `scan.exclude` field to affect those, if you have large
        # directories that should not be watched for changes.
        exclude:

        # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a
        # specific branch or tag, with the format: <git remote url>#<branch|tag>
        #
        # Garden will import the repository source code into this module, but read the module's config from the local
        # garden.yml file.
        repositoryUrl:

        # When false, disables pushing this module to remote registries via the publish command.
        allowPublish:

        # A map of variables scoped to this particular module. These are resolved before any other parts of the module
        # configuration and take precedence over project-scoped variables. They may reference project-scoped
        # variables, and generally use any template strings normally allowed when resolving modules.
        variables:
          <name>:

        # Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
        # module-level `variables` field.
        #
        # The format of the files is determined by the configured file's extension:
        #
        # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys
        # may contain any value type. YAML format is used by default.
        # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
        # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
        #
        # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
        # nested objects and arrays._
        #
        # To use different module-level varfiles in different environments, you can template in the environment name
        # to the varfile name, e.g. `varfile: "my-module.${environment.name}.env` (this assumes that the corresponding
        # varfiles exist).
        varfile:

        # The filesystem path of the module.
        path:

        # The filesystem path of the module config file.
        configPath:

        # The resolved build configuration of the module. If this is returned by the configure handler for the module
        # type, we can provide more granular versioning for the module, with a separate build version (i.e. module
        # version), as well as separate service, task and test versions, instead of applying the same version to all
        # of them.
        #
        # When this is specified, it is **very important** that this field contains all configurable (or otherwise
        # dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash
        # of those is separately computed).
        buildConfig:

        # List of services configured by this module.
        serviceConfigs:
          - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
            # letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be
            # longer than 63 characters.
            name:

            # The names of any services that this service depends on at runtime, and the names of any tasks that
            # should be executed before this service is deployed.
            # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions
            # in template strings.
            dependencies:

            # Set this to `true` to disable the service. You can use this with conditional template strings to
            # enable/disable services based on, for example, the current environment or other variables (e.g.
            # `enabled: ${environment.name != "prod"}`). This can be handy when you only need certain services for
            # specific environments, e.g. only for development.
            #
            # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a
            # runtime dependency for another service, test or task.
            #
            # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to
            # resolve when the service is disabled, so you need to make sure to provide alternate values for those if
            # you're using them, using conditional expressions.
            disabled:

            # The `validate` module action should populate this, if the service's code sources are contained in a
            # separate module from the parent module. For example, when the service belongs to a module that contains
            # manifests (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container
            # module).
            sourceModuleName:

            # The service's specification, as defined by its provider plugin.
            spec:

        # List of tasks configured by this module.
        taskConfigs:
          - # The name of the task.
            name:

            # A description of the task.
            description:

            # The names of any tasks that must be executed, and the names of any services that must be running, before
            # this task is executed.
            # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions
            # in template strings.
            dependencies:

            # Set this to `true` to disable the task. You can use this with conditional template strings to
            # enable/disable tasks based on, for example, the current environment or other variables (e.g. `enabled:
            # ${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in specific
            # environments, e.g. only for development.
            #
            # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
            # dependency for another service, test or task.
            #
            # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
            # resolve when the task is disabled, so you need to make sure to provide alternate values for those if
            # you're using them, using conditional expressions.
            disabled:

            # Maximum duration (in seconds) of the task's execution.
            timeout:

            # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any
            # time your project (or one or more of the task's dependants) is deployed. Otherwise the task is only
            # re-run when its version changes (i.e. the module or one of its dependencies is modified), or when you
            # run `garden run`.
            cacheResult:

            # The task's specification, as defined by its provider plugin.
            spec:

        # List of tests configured by this module.
        testConfigs:
          - # The name of the test.
            name:

            # The names of any services that must be running, and the names of any tasks that must be executed, before
            # the test is run.
            dependencies:

            # Set this to `true` to disable the test. You can use this with conditional template strings to
            # enable/disable tests based on, for example, the current environment or other variables (e.g.
            # `enabled: ${environment.name != "prod"}`). This is handy when you only want certain tests to run in
            # specific environments, e.g. only during CI.
            disabled:

            # Maximum duration (in seconds) of the test run.
            timeout:

            # The configuration for the test, as specified by its module's provider.
            spec:

        # The module spec, as defined by the provider plugin.
        spec:

        # The name of the parent module (e.g. a templated module that generated this module), if applicable.
        parentName:

        # The module template that generated the module, if applicable.
        templateName:

        # Inputs provided when rendering the module from a module template, if applicable.
        inputs:
          <name>:

    # Description of an environment's status for a provider.
    status:
      # Set to true if the environment is fully configured for a provider.
      ready:

      # Use this to include additional information that is specific to the provider.
      detail:

      # Output variables that modules and other variables can reference.
      outputs:
        <name>:

      # Set to true to disable caching of the status.
      disableCache:

    state:

    outputs:

    # A list of pages that the provider adds to the Garden dashboard.
    dashboardPages:
      - # A unique identifier for the page.
        name:

        # The link title to show in the menu bar (max length 32).
        title:

        # A description to show when hovering over the link.
        description:

        # The URL to open in the dashboard pane when clicking the link. If none is specified, the provider must
        # specify a `getDashboardPage` handler that resolves the URL given the `name` of this page.
        url:

        # Set to true if the link should open in a new browser tab/window.
        newWindow:

# All configured project variables in the environment.
variables:
  <name>:

# The 'importVariables' config
importVariables:
  - # Import variables from a Garden Cloud variable list.
    from:

    # The ID of the variable list to import from Garden Cloud.
    list:

    # Variable lists are referenced by their IDs so here you can add an optional description. When copying the
    # variable list information from Garden Cloud the description will be prepopulated.
    description:

# All action configs in the project.
actionConfigs:
  # Build action configs in the project.
  Build:
    <name>:
      # The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will
      # be defined by your configured providers.
      type:

      # A valid name for the action. Must be unique across all actions of the same _kind_ in your project.
      name:

      # A description of the action.
      description:

      # By default, the directory where the action is defined is used as the source for the build context.
      #
      # You can override the directory that is used for the build context by setting `source.path`.
      #
      # You can use `source.repository` to get the source from an external repository. For more information on remote
      # actions, please refer to the [Remote Sources
      # guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).
      source:
        # A relative POSIX-style path to the source directory for this action.
        #
        # If specified together with `source.repository`, the path will be relative to the repository root.
        #
        # Otherwise, the path will be relative to the directory containing the Garden configuration file.
        path:

        # When set, Garden will import the action source from this repository, but use this action configuration (and
        # not scan for configs in the separate repository).
        repository:
          # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a
          # specific branch or tag, with the format: <git remote url>#<branch|tag>
          url:

      # A list of other actions that this action depends on, and should be built, deployed or run (depending on the
      # action type) before processing this action.
      #
      # Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`,
      # `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.
      #
      # You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.
      #
      # Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency
      # via template expressions.
      dependencies:

      # Set this to `true` to disable the action. You can use this with conditional template strings to disable
      # actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name
      # == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for
      # development.
      #
      # For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another
      # enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or
      # built).
      #
      # For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored.
      # Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the
      # action is disabled, so you need to make sure to provide alternate values for those if you're using them, using
      # conditional expressions.
      disabled:

      # If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand
      # for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is
      # equivalent to `disabled: ${environment.name != "prod"}`.
      environments:

      # Set the log level for this action. If not set, the action inherits the log level set for the command being
      # executed.
      #
      # Setting this can be useful for actions that produce a lot of log output that is not relevant to the user, or
      # when debugging a specific action.
      #
      # The `silent` level effectively suppresses log output from this action, except for errors.
      logLevel:

      # A map of variables scoped to this particular action. These are resolved before any other parts of the action
      # configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in
      # that order. They may reference group-scoped and project-scoped variables, and generally can use any template
      # strings normally allowed when resolving the action.
      variables:
        <name>:

      # Specify a list of paths (relative to the directory where the action is defined) to a file containing
      # variables, that we apply on top of the action-level `variables` field, and take precedence over group-level
      # variables (if applicable) and project-level variables, in that order.
      #
      # If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over
      # the previous ones.
      #
      # The format of the files is determined by the configured file's extension:
      #
      # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
      # contain any value type. YAML format is used by default.
      # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
      # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
      #
      # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
      # nested objects and arrays._
      #
      # To use different varfiles in different environments, you can template in the environment name to the varfile
      # name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles
      # exist).
      #
      # If a listed varfile cannot be found, throwing an error.
      # To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean
      # field.
      # varfiles:
      #   - path: my-action.env
      #     optional: true
      varfiles:
        - # Path to a file containing a path.
          path:

          # Whether the varfile is optional.
          optional:

      version:
        # Specify a list of dependencies that should be ignored when computing the version hash for this action.
        #
        # Generally, the versions of all dependencies (both implicit and explicitly specified) are used when computing
        # the version hash for this action.
        # However, there are cases where you might want to exclude certain dependencies from the version hash.
        #
        # For example, you might have a dependency that naturally changes for every individual test or dev
        # environment, such as a setup script that runs before the test. You could solve for that with something like
        # this:
        #
        # version:
        #   excludeDependencies:
        #     - run.setup
        #
        # Where `run.setup` refers to a Run action named `setup`. You can also use the full action reference for each
        # dependency to exclude, e.g. `{ kind: "Run", name: "setup" }`.
        excludeDependencies:

        # Specify a list of config fields that should be ignored when computing the version hash for this action. Each
        # item should be an array of strings, specifying the path to the field to ignore, e.g. `[spec, env, HOSTNAME]`
        # would ignore `spec.env.HOSTNAME` in the configuration when computing the version.
        #
        # For example, you might have a field that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeFields:
        #     - [spec, env, HOSTNAME]
        #
        # Arrays can also be indexed with numeric indices, but you can also use wildcards to exclude specific fields
        # on all objects in arrays. Example:
        #
        # kind: Test
        # type: container
        # ...
        # spec:
        #   artifacts:
        #     - source: foo
        #       target: bar  # Gets excluded from the version calculation
        # version:
        #   excludeFields:
        #     - [spec, artifacts, "*", target]
        #
        # Only simple `"*"` wildcards are supported for the moment (i.e. you can't exclude by `"something*"` or use
        # question marks for individual character matching).
        #
        # Note that it is very important not to specify overly broad exclusions here, as this may cause the version to
        # change too rarely, which may cause build errors or tests to not run when they should.
        excludeFields:

        # Specify one or more file paths that should be ignored when computing the version hash for this action.
        #
        # Specify in the same format as the `include` field. You may use glob patterns here.
        #
        # For example, you might have a file that naturally changes for every build, such as a compiled binary (that
        # isn't deterministic down to the byte), that you need to have in the build but shouldn't affect the version.
        # You could solve for that with something like this:
        #
        # include:
        #   - src/**/*
        #   - some/compiled/binary
        # version:
        #   excludeFiles:
        #     - some/compiled/binary
        #
        # Note that when you use this, you do need to make sure that other files or config fields do affect the
        # version appropriately. Otherwise you might run into issues where builds are not updated or tests are not run
        # when they should be.
        excludeFiles:

        # Specify one or more string values that should be ignored when computing the version hash for this action.
        # You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.
        #
        # For example, you might have a variable that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeValues:
        #     - ${var.hostname}
        #
        # With the `hostname` variable being defined in the Project configuration.
        #
        # For each value specified under this field, every occurrence of that string value (even as part of a longer
        # string) will be replaced when calculating the action version. The action configuration (used when performing
        # the action) is not affected.
        #
        # For instances when the value to replace may be overly broad (e.g. "api") it is generally better to use the
        # `excludeFields` option, since that can be applied more surgically.
        excludeValues:

      # The spec for the specific action type.
      spec:

      kind:

      # When false, disables publishing this build to remote registries via the publish command.
      allowPublish:

      # By default, builds are _staged_ in `.garden/build/<build name>` and that directory is used as the build
      # context. This is done to avoid builds contaminating the source tree, which can end up confusing version
      # computation, or a build including files that are not intended to be part of it. In most scenarios, the default
      # behavior is desired and leads to the most predictable and verifiable builds, as well as avoiding potential
      # confusion around file watching.
      #
      # You _can_ override this by setting `buildAtSource: true`, which basically sets the build root for this action
      # at the location of the Build action config in the source tree. This means e.g. that the build command in
      # `exec` Builds runs at the source, and for Docker image builds the build is initiated from the source
      # directory.
      #
      # An important implication is that `include` and `exclude` directives for the action, as well as `.gardenignore`
      # files, only affect version hash computation but are otherwise not effective in controlling the build context.
      # This may lead to unexpected variation in builds with the same version hash. **This may also slow down code
      # synchronization to remote destinations, e.g. when performing remote Docker image builds.**
      #
      # Additionally, any `exec` runtime actions (and potentially others) that reference this Build with the `build`
      # field, will run from the source directory of this action.
      #
      # While there may be good reasons to do this in some situations, please be aware that this increases the
      # potential for side-effects and variability in builds. **You must take extra care**, including making sure that
      # files generated during builds are excluded with e.g. `.gardenignore` files or `exclude` fields on potentially
      # affected actions. Another potential issue is causing infinite loops when running with file-watching enabled,
      # basically triggering a new build during the build.
      buildAtSource:

      # Copy files from other builds, ahead of running this build.
      copyFrom:
        - # The name of the Build action to copy from.
          build:

          # POSIX-style path or filename of the directory or file(s) to copy to the target, relative to the build path
          # of the source build.
          sourcePath:

          # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
          # Defaults to to same as source path.
          targetPath:

      # Specify a list of POSIX-style paths or globs that should be included as the build context for the Build, and
      # will affect the computed _version_ of the action.
      #
      # If nothing is specified here, the whole directory may be assumed to be included in the build. Providers are
      # sometimes able to infer the list of paths, e.g. from a Dockerfile, but often this is inaccurate (say, if a
      # Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or `exclude` to define the
      # build context. Otherwise you may find unrelated files being included in the build context and the build
      # version, which may result in unnecessarily repeated builds.
      #
      # You can _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree,
      # which use the same format as `.gitignore` files. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      include:

      # Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the build context
      # and the Build version.
      #
      # Providers are sometimes able to infer the `include` field, e.g. from a Dockerfile, but often this is
      # inaccurate (say, if a Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or
      # `exclude` to define the build context. Otherwise you may find unrelated files being included in the build
      # context and the build version, which may result in unnecessarily repeated builds.
      #
      # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
      # directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect
      # those, if you have large directories that should not be watched for changes.
      exclude:

      # Set a timeout for the build to complete, in seconds.
      timeout:

  # Deploy action configs in the project.
  Deploy:
    <name>:
      # The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will
      # be defined by your configured providers.
      type:

      # A valid name for the action. Must be unique across all actions of the same _kind_ in your project.
      name:

      # A description of the action.
      description:

      # By default, the directory where the action is defined is used as the source for the build context.
      #
      # You can override the directory that is used for the build context by setting `source.path`.
      #
      # You can use `source.repository` to get the source from an external repository. For more information on remote
      # actions, please refer to the [Remote Sources
      # guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).
      source:
        # A relative POSIX-style path to the source directory for this action.
        #
        # If specified together with `source.repository`, the path will be relative to the repository root.
        #
        # Otherwise, the path will be relative to the directory containing the Garden configuration file.
        path:

        # When set, Garden will import the action source from this repository, but use this action configuration (and
        # not scan for configs in the separate repository).
        repository:
          # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a
          # specific branch or tag, with the format: <git remote url>#<branch|tag>
          url:

      # A list of other actions that this action depends on, and should be built, deployed or run (depending on the
      # action type) before processing this action.
      #
      # Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`,
      # `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.
      #
      # You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.
      #
      # Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency
      # via template expressions.
      dependencies:

      # Set this to `true` to disable the action. You can use this with conditional template strings to disable
      # actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name
      # == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for
      # development.
      #
      # For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another
      # enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or
      # built).
      #
      # For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored.
      # Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the
      # action is disabled, so you need to make sure to provide alternate values for those if you're using them, using
      # conditional expressions.
      disabled:

      # If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand
      # for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is
      # equivalent to `disabled: ${environment.name != "prod"}`.
      environments:

      # Set the log level for this action. If not set, the action inherits the log level set for the command being
      # executed.
      #
      # Setting this can be useful for actions that produce a lot of log output that is not relevant to the user, or
      # when debugging a specific action.
      #
      # The `silent` level effectively suppresses log output from this action, except for errors.
      logLevel:

      # Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus
      # will affect the computed _version_ of the action.
      #
      # For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred.
      # An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be
      # inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test
      # action is run when certain files are modified.
      #
      # _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so
      # please reference the docs for more information on those.
      #
      # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
      # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      include:

      # Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's
      # version.
      #
      # For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred.
      # For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set
      # `include` paths, or such paths inferred by providers. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      #
      # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
      # directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect
      # those, if you have large directories that should not be watched for changes.
      exclude:

      # A map of variables scoped to this particular action. These are resolved before any other parts of the action
      # configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in
      # that order. They may reference group-scoped and project-scoped variables, and generally can use any template
      # strings normally allowed when resolving the action.
      variables:
        <name>:

      # Specify a list of paths (relative to the directory where the action is defined) to a file containing
      # variables, that we apply on top of the action-level `variables` field, and take precedence over group-level
      # variables (if applicable) and project-level variables, in that order.
      #
      # If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over
      # the previous ones.
      #
      # The format of the files is determined by the configured file's extension:
      #
      # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
      # contain any value type. YAML format is used by default.
      # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
      # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
      #
      # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
      # nested objects and arrays._
      #
      # To use different varfiles in different environments, you can template in the environment name to the varfile
      # name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles
      # exist).
      #
      # If a listed varfile cannot be found, throwing an error.
      # To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean
      # field.
      # varfiles:
      #   - path: my-action.env
      #     optional: true
      varfiles:
        - # Path to a file containing a path.
          path:

          # Whether the varfile is optional.
          optional:

      version:
        # Specify a list of dependencies that should be ignored when computing the version hash for this action.
        #
        # Generally, the versions of all dependencies (both implicit and explicitly specified) are used when computing
        # the version hash for this action.
        # However, there are cases where you might want to exclude certain dependencies from the version hash.
        #
        # For example, you might have a dependency that naturally changes for every individual test or dev
        # environment, such as a setup script that runs before the test. You could solve for that with something like
        # this:
        #
        # version:
        #   excludeDependencies:
        #     - run.setup
        #
        # Where `run.setup` refers to a Run action named `setup`. You can also use the full action reference for each
        # dependency to exclude, e.g. `{ kind: "Run", name: "setup" }`.
        excludeDependencies:

        # Specify a list of config fields that should be ignored when computing the version hash for this action. Each
        # item should be an array of strings, specifying the path to the field to ignore, e.g. `[spec, env, HOSTNAME]`
        # would ignore `spec.env.HOSTNAME` in the configuration when computing the version.
        #
        # For example, you might have a field that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeFields:
        #     - [spec, env, HOSTNAME]
        #
        # Arrays can also be indexed with numeric indices, but you can also use wildcards to exclude specific fields
        # on all objects in arrays. Example:
        #
        # kind: Test
        # type: container
        # ...
        # spec:
        #   artifacts:
        #     - source: foo
        #       target: bar  # Gets excluded from the version calculation
        # version:
        #   excludeFields:
        #     - [spec, artifacts, "*", target]
        #
        # Only simple `"*"` wildcards are supported for the moment (i.e. you can't exclude by `"something*"` or use
        # question marks for individual character matching).
        #
        # Note that it is very important not to specify overly broad exclusions here, as this may cause the version to
        # change too rarely, which may cause build errors or tests to not run when they should.
        excludeFields:

        # Specify one or more file paths that should be ignored when computing the version hash for this action.
        #
        # Specify in the same format as the `include` field. You may use glob patterns here.
        #
        # For example, you might have a file that naturally changes for every build, such as a compiled binary (that
        # isn't deterministic down to the byte), that you need to have in the build but shouldn't affect the version.
        # You could solve for that with something like this:
        #
        # include:
        #   - src/**/*
        #   - some/compiled/binary
        # version:
        #   excludeFiles:
        #     - some/compiled/binary
        #
        # Note that when you use this, you do need to make sure that other files or config fields do affect the
        # version appropriately. Otherwise you might run into issues where builds are not updated or tests are not run
        # when they should be.
        excludeFiles:

        # Specify one or more string values that should be ignored when computing the version hash for this action.
        # You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.
        #
        # For example, you might have a variable that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeValues:
        #     - ${var.hostname}
        #
        # With the `hostname` variable being defined in the Project configuration.
        #
        # For each value specified under this field, every occurrence of that string value (even as part of a longer
        # string) will be replaced when calculating the action version. The action configuration (used when performing
        # the action) is not affected.
        #
        # For instances when the value to replace may be overly broad (e.g. "api") it is generally better to use the
        # `excludeFields` option, since that can be applied more surgically.
        excludeValues:

      # The spec for the specific action type.
      spec:

      # Specify a _Build_ action, and resolve this action from the context of that Build.
      #
      # For example, you might create an `exec` Build which prepares some manifests, and then reference that in a
      # `kubernetes` _Deploy_ action, and the resulting manifests from the Build.
      #
      # This would mean that instead of looking for manifest files relative to this action's location in your project
      # structure, the output directory for the referenced `exec` Build would be the source.
      build:

      kind:

      # Timeout for the deploy to complete, in seconds.
      timeout:

      # Set this to `false` to prevent this Deploy from being removed during `garden cleanup deploy` or `garden
      # cleanup namespace` commands. This is useful for preventing the cleanup of persistent resources like PVCs or
      # databases during cleanup operations.
      #
      # Use the `--force` flag on the cleanup commands to override this and clean up deploys regardless of this flag.
      removeOnCleanup:

  # Run action configs in the project.
  Run:
    <name>:
      # The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will
      # be defined by your configured providers.
      type:

      # A valid name for the action. Must be unique across all actions of the same _kind_ in your project.
      name:

      # A description of the action.
      description:

      # By default, the directory where the action is defined is used as the source for the build context.
      #
      # You can override the directory that is used for the build context by setting `source.path`.
      #
      # You can use `source.repository` to get the source from an external repository. For more information on remote
      # actions, please refer to the [Remote Sources
      # guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).
      source:
        # A relative POSIX-style path to the source directory for this action.
        #
        # If specified together with `source.repository`, the path will be relative to the repository root.
        #
        # Otherwise, the path will be relative to the directory containing the Garden configuration file.
        path:

        # When set, Garden will import the action source from this repository, but use this action configuration (and
        # not scan for configs in the separate repository).
        repository:
          # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a
          # specific branch or tag, with the format: <git remote url>#<branch|tag>
          url:

      # A list of other actions that this action depends on, and should be built, deployed or run (depending on the
      # action type) before processing this action.
      #
      # Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`,
      # `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.
      #
      # You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.
      #
      # Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency
      # via template expressions.
      dependencies:

      # Set this to `true` to disable the action. You can use this with conditional template strings to disable
      # actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name
      # == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for
      # development.
      #
      # For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another
      # enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or
      # built).
      #
      # For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored.
      # Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the
      # action is disabled, so you need to make sure to provide alternate values for those if you're using them, using
      # conditional expressions.
      disabled:

      # If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand
      # for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is
      # equivalent to `disabled: ${environment.name != "prod"}`.
      environments:

      # Set the log level for this action. If not set, the action inherits the log level set for the command being
      # executed.
      #
      # Setting this can be useful for actions that produce a lot of log output that is not relevant to the user, or
      # when debugging a specific action.
      #
      # The `silent` level effectively suppresses log output from this action, except for errors.
      logLevel:

      # Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus
      # will affect the computed _version_ of the action.
      #
      # For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred.
      # An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be
      # inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test
      # action is run when certain files are modified.
      #
      # _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so
      # please reference the docs for more information on those.
      #
      # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
      # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      include:

      # Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's
      # version.
      #
      # For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred.
      # For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set
      # `include` paths, or such paths inferred by providers. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      #
      # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
      # directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect
      # those, if you have large directories that should not be watched for changes.
      exclude:

      # A map of variables scoped to this particular action. These are resolved before any other parts of the action
      # configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in
      # that order. They may reference group-scoped and project-scoped variables, and generally can use any template
      # strings normally allowed when resolving the action.
      variables:
        <name>:

      # Specify a list of paths (relative to the directory where the action is defined) to a file containing
      # variables, that we apply on top of the action-level `variables` field, and take precedence over group-level
      # variables (if applicable) and project-level variables, in that order.
      #
      # If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over
      # the previous ones.
      #
      # The format of the files is determined by the configured file's extension:
      #
      # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
      # contain any value type. YAML format is used by default.
      # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
      # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
      #
      # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
      # nested objects and arrays._
      #
      # To use different varfiles in different environments, you can template in the environment name to the varfile
      # name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles
      # exist).
      #
      # If a listed varfile cannot be found, throwing an error.
      # To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean
      # field.
      # varfiles:
      #   - path: my-action.env
      #     optional: true
      varfiles:
        - # Path to a file containing a path.
          path:

          # Whether the varfile is optional.
          optional:

      version:
        # Specify a list of dependencies that should be ignored when computing the version hash for this action.
        #
        # Generally, the versions of all dependencies (both implicit and explicitly specified) are used when computing
        # the version hash for this action.
        # However, there are cases where you might want to exclude certain dependencies from the version hash.
        #
        # For example, you might have a dependency that naturally changes for every individual test or dev
        # environment, such as a setup script that runs before the test. You could solve for that with something like
        # this:
        #
        # version:
        #   excludeDependencies:
        #     - run.setup
        #
        # Where `run.setup` refers to a Run action named `setup`. You can also use the full action reference for each
        # dependency to exclude, e.g. `{ kind: "Run", name: "setup" }`.
        excludeDependencies:

        # Specify a list of config fields that should be ignored when computing the version hash for this action. Each
        # item should be an array of strings, specifying the path to the field to ignore, e.g. `[spec, env, HOSTNAME]`
        # would ignore `spec.env.HOSTNAME` in the configuration when computing the version.
        #
        # For example, you might have a field that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeFields:
        #     - [spec, env, HOSTNAME]
        #
        # Arrays can also be indexed with numeric indices, but you can also use wildcards to exclude specific fields
        # on all objects in arrays. Example:
        #
        # kind: Test
        # type: container
        # ...
        # spec:
        #   artifacts:
        #     - source: foo
        #       target: bar  # Gets excluded from the version calculation
        # version:
        #   excludeFields:
        #     - [spec, artifacts, "*", target]
        #
        # Only simple `"*"` wildcards are supported for the moment (i.e. you can't exclude by `"something*"` or use
        # question marks for individual character matching).
        #
        # Note that it is very important not to specify overly broad exclusions here, as this may cause the version to
        # change too rarely, which may cause build errors or tests to not run when they should.
        excludeFields:

        # Specify one or more file paths that should be ignored when computing the version hash for this action.
        #
        # Specify in the same format as the `include` field. You may use glob patterns here.
        #
        # For example, you might have a file that naturally changes for every build, such as a compiled binary (that
        # isn't deterministic down to the byte), that you need to have in the build but shouldn't affect the version.
        # You could solve for that with something like this:
        #
        # include:
        #   - src/**/*
        #   - some/compiled/binary
        # version:
        #   excludeFiles:
        #     - some/compiled/binary
        #
        # Note that when you use this, you do need to make sure that other files or config fields do affect the
        # version appropriately. Otherwise you might run into issues where builds are not updated or tests are not run
        # when they should be.
        excludeFiles:

        # Specify one or more string values that should be ignored when computing the version hash for this action.
        # You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.
        #
        # For example, you might have a variable that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeValues:
        #     - ${var.hostname}
        #
        # With the `hostname` variable being defined in the Project configuration.
        #
        # For each value specified under this field, every occurrence of that string value (even as part of a longer
        # string) will be replaced when calculating the action version. The action configuration (used when performing
        # the action) is not affected.
        #
        # For instances when the value to replace may be overly broad (e.g. "api") it is generally better to use the
        # `excludeFields` option, since that can be applied more surgically.
        excludeValues:

      # The spec for the specific action type.
      spec:

      # Specify a _Build_ action, and resolve this action from the context of that Build.
      #
      # For example, you might create an `exec` Build which prepares some manifests, and then reference that in a
      # `kubernetes` _Deploy_ action, and the resulting manifests from the Build.
      #
      # This would mean that instead of looking for manifest files relative to this action's location in your project
      # structure, the output directory for the referenced `exec` Build would be the source.
      build:

      kind:

      # Set a timeout for the run to complete, in seconds.
      timeout:

  # Test action configs in the project.
  Test:
    <name>:
      # The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will
      # be defined by your configured providers.
      type:

      # A valid name for the action. Must be unique across all actions of the same _kind_ in your project.
      name:

      # A description of the action.
      description:

      # By default, the directory where the action is defined is used as the source for the build context.
      #
      # You can override the directory that is used for the build context by setting `source.path`.
      #
      # You can use `source.repository` to get the source from an external repository. For more information on remote
      # actions, please refer to the [Remote Sources
      # guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).
      source:
        # A relative POSIX-style path to the source directory for this action.
        #
        # If specified together with `source.repository`, the path will be relative to the repository root.
        #
        # Otherwise, the path will be relative to the directory containing the Garden configuration file.
        path:

        # When set, Garden will import the action source from this repository, but use this action configuration (and
        # not scan for configs in the separate repository).
        repository:
          # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a
          # specific branch or tag, with the format: <git remote url>#<branch|tag>
          url:

      # A list of other actions that this action depends on, and should be built, deployed or run (depending on the
      # action type) before processing this action.
      #
      # Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`,
      # `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.
      #
      # You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.
      #
      # Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency
      # via template expressions.
      dependencies:

      # Set this to `true` to disable the action. You can use this with conditional template strings to disable
      # actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name
      # == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for
      # development.
      #
      # For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another
      # enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or
      # built).
      #
      # For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored.
      # Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the
      # action is disabled, so you need to make sure to provide alternate values for those if you're using them, using
      # conditional expressions.
      disabled:

      # If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand
      # for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is
      # equivalent to `disabled: ${environment.name != "prod"}`.
      environments:

      # Set the log level for this action. If not set, the action inherits the log level set for the command being
      # executed.
      #
      # Setting this can be useful for actions that produce a lot of log output that is not relevant to the user, or
      # when debugging a specific action.
      #
      # The `silent` level effectively suppresses log output from this action, except for errors.
      logLevel:

      # Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus
      # will affect the computed _version_ of the action.
      #
      # For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred.
      # An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be
      # inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test
      # action is run when certain files are modified.
      #
      # _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so
      # please reference the docs for more information on those.
      #
      # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
      # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      include:

      # Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's
      # version.
      #
      # For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred.
      # For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set
      # `include` paths, or such paths inferred by providers. See the [Configuration Files
      # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
      # for details.
      #
      # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
      # directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect
      # those, if you have large directories that should not be watched for changes.
      exclude:

      # A map of variables scoped to this particular action. These are resolved before any other parts of the action
      # configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in
      # that order. They may reference group-scoped and project-scoped variables, and generally can use any template
      # strings normally allowed when resolving the action.
      variables:
        <name>:

      # Specify a list of paths (relative to the directory where the action is defined) to a file containing
      # variables, that we apply on top of the action-level `variables` field, and take precedence over group-level
      # variables (if applicable) and project-level variables, in that order.
      #
      # If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over
      # the previous ones.
      #
      # The format of the files is determined by the configured file's extension:
      #
      # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
      # contain any value type. YAML format is used by default.
      # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
      # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
      #
      # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
      # nested objects and arrays._
      #
      # To use different varfiles in different environments, you can template in the environment name to the varfile
      # name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles
      # exist).
      #
      # If a listed varfile cannot be found, throwing an error.
      # To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean
      # field.
      # varfiles:
      #   - path: my-action.env
      #     optional: true
      varfiles:
        - # Path to a file containing a path.
          path:

          # Whether the varfile is optional.
          optional:

      version:
        # Specify a list of dependencies that should be ignored when computing the version hash for this action.
        #
        # Generally, the versions of all dependencies (both implicit and explicitly specified) are used when computing
        # the version hash for this action.
        # However, there are cases where you might want to exclude certain dependencies from the version hash.
        #
        # For example, you might have a dependency that naturally changes for every individual test or dev
        # environment, such as a setup script that runs before the test. You could solve for that with something like
        # this:
        #
        # version:
        #   excludeDependencies:
        #     - run.setup
        #
        # Where `run.setup` refers to a Run action named `setup`. You can also use the full action reference for each
        # dependency to exclude, e.g. `{ kind: "Run", name: "setup" }`.
        excludeDependencies:

        # Specify a list of config fields that should be ignored when computing the version hash for this action. Each
        # item should be an array of strings, specifying the path to the field to ignore, e.g. `[spec, env, HOSTNAME]`
        # would ignore `spec.env.HOSTNAME` in the configuration when computing the version.
        #
        # For example, you might have a field that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeFields:
        #     - [spec, env, HOSTNAME]
        #
        # Arrays can also be indexed with numeric indices, but you can also use wildcards to exclude specific fields
        # on all objects in arrays. Example:
        #
        # kind: Test
        # type: container
        # ...
        # spec:
        #   artifacts:
        #     - source: foo
        #       target: bar  # Gets excluded from the version calculation
        # version:
        #   excludeFields:
        #     - [spec, artifacts, "*", target]
        #
        # Only simple `"*"` wildcards are supported for the moment (i.e. you can't exclude by `"something*"` or use
        # question marks for individual character matching).
        #
        # Note that it is very important not to specify overly broad exclusions here, as this may cause the version to
        # change too rarely, which may cause build errors or tests to not run when they should.
        excludeFields:

        # Specify one or more file paths that should be ignored when computing the version hash for this action.
        #
        # Specify in the same format as the `include` field. You may use glob patterns here.
        #
        # For example, you might have a file that naturally changes for every build, such as a compiled binary (that
        # isn't deterministic down to the byte), that you need to have in the build but shouldn't affect the version.
        # You could solve for that with something like this:
        #
        # include:
        #   - src/**/*
        #   - some/compiled/binary
        # version:
        #   excludeFiles:
        #     - some/compiled/binary
        #
        # Note that when you use this, you do need to make sure that other files or config fields do affect the
        # version appropriately. Otherwise you might run into issues where builds are not updated or tests are not run
        # when they should be.
        excludeFiles:

        # Specify one or more string values that should be ignored when computing the version hash for this action.
        # You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.
        #
        # For example, you might have a variable that naturally changes for every individual test or dev environment,
        # such as a dynamic hostname. You could solve for that with something like this:
        #
        # version:
        #   excludeValues:
        #     - ${var.hostname}
        #
        # With the `hostname` variable being defined in the Project configuration.
        #
        # For each value specified under this field, every occurrence of that string value (even as part of a longer
        # string) will be replaced when calculating the action version. The action configuration (used when performing
        # the action) is not affected.
        #
        # For instances when the value to replace may be overly broad (e.g. "api") it is generally better to use the
        # `excludeFields` option, since that can be applied more surgically.
        excludeValues:

      # The spec for the specific action type.
      spec:

      # Specify a _Build_ action, and resolve this action from the context of that Build.
      #
      # For example, you might create an `exec` Build which prepares some manifests, and then reference that in a
      # `kubernetes` _Deploy_ action, and the resulting manifests from the Build.
      #
      # This would mean that instead of looking for manifest files relative to this action's location in your project
      # structure, the output directory for the referenced `exec` Build would be the source.
      build:

      kind:

      # Set a timeout for the test to complete, in seconds.
      timeout:

# All module configs in the project.
moduleConfigs:
  - kind:

    # The type of this module.
    type:

    # The name of this module.
    name:

    # Specify how to build the module. Note that plugins may define additional keys on this object.
    build:
      # A list of modules that must be built before this module is built.
      dependencies:
        - # Module name to build ahead of this module.
          name:

          # Specify one or more files or directories to copy from the built dependency to this module.
          copy:
            - # POSIX-style path or filename of the directory or file(s) to copy to the target.
              source:

              # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
              # Defaults to the same as source path.
              target:

      # Maximum time in seconds to wait for build to finish.
      timeout:

    # If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
    # instead of in the Garden build directory (under .garden/build/<module-name>).
    #
    # Garden will therefore not stage the build for local modules. This means that include/exclude filters
    # and ignore files are not applied to local modules, except to calculate the module/action versions.
    #
    # If you use use `build.dependencies[].copy` for one or more build dependencies of this module, the copied files
    # will be copied to the module source directory (instead of the build directory, as is the default case when
    # `local = false`).
    #
    # Note: This maps to the `buildAtSource` option in this module's generated Build action (if any).
    local:

    # A description of the module.
    description:

    # Set this to `true` to disable the module. You can use this with conditional template strings to disable modules
    # based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name ==
    # "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for
    # development.
    #
    # Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.
    #
    # If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
    # will automatically ignore those dependency declarations. Note however that template strings referencing the
    # module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you
    # need to make sure to provide alternate values for those if you're using them, using conditional expressions.
    disabled:

    # Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files
    # that do *not* match these paths or globs are excluded when computing the version of the module, when responding
    # to filesystem watch events, and when staging builds.
    #
    # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
    # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
    # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
    # for details.
    #
    # Also note that specifying an empty list here means _no sources_ should be included.
    include:

    # Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match
    # these paths or globs are excluded when computing the version of the module, when responding to filesystem watch
    # events, and when staging builds.
    #
    # Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
    # field, the files/patterns specified here are filtered from the files matched by `include`. See the
    # [Configuration Files
    # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
    # for details.
    #
    # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
    # directories are watched for changes. Use the project `scan.exclude` field to affect those, if you have large
    # directories that should not be watched for changes.
    exclude:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    #
    # Garden will import the repository source code into this module, but read the module's config from the local
    # garden.yml file.
    repositoryUrl:

    # When false, disables pushing this module to remote registries via the publish command.
    allowPublish:

    # A map of variables scoped to this particular module. These are resolved before any other parts of the module
    # configuration and take precedence over project-scoped variables. They may reference project-scoped variables,
    # and generally use any template strings normally allowed when resolving modules.
    variables:
      <name>:

    # Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
    # module-level `variables` field.
    #
    # The format of the files is determined by the configured file's extension:
    #
    # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
    # contain any value type. YAML format is used by default.
    # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
    # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
    #
    # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
    # nested objects and arrays._
    #
    # To use different module-level varfiles in different environments, you can template in the environment name
    # to the varfile name, e.g. `varfile: "my-module.${environment.name}.env` (this assumes that the corresponding
    # varfiles exist).
    varfile:

    # The filesystem path of the module.
    path:

    # The filesystem path of the module config file.
    configPath:

    # The resolved build configuration of the module. If this is returned by the configure handler for the module
    # type, we can provide more granular versioning for the module, with a separate build version (i.e. module
    # version), as well as separate service, task and test versions, instead of applying the same version to all of
    # them.
    #
    # When this is specified, it is **very important** that this field contains all configurable (or otherwise
    # dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash of
    # those is separately computed).
    buildConfig:

    # List of services configured by this module.
    serviceConfigs:
      - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer
        # than 63 characters.
        name:

        # The names of any services that this service depends on at runtime, and the names of any tasks that should be
        # executed before this service is deployed.
        # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in
        # template strings.
        dependencies:

        # Set this to `true` to disable the service. You can use this with conditional template strings to
        # enable/disable services based on, for example, the current environment or other variables (e.g. `enabled:
        # ${environment.name != "prod"}`). This can be handy when you only need certain services for specific
        # environments, e.g. only for development.
        #
        # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a
        # runtime dependency for another service, test or task.
        #
        # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to
        # resolve when the service is disabled, so you need to make sure to provide alternate values for those if
        # you're using them, using conditional expressions.
        disabled:

        # The `validate` module action should populate this, if the service's code sources are contained in a separate
        # module from the parent module. For example, when the service belongs to a module that contains manifests
        # (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container module).
        sourceModuleName:

        # The service's specification, as defined by its provider plugin.
        spec:

    # List of tasks configured by this module.
    taskConfigs:
      - # The name of the task.
        name:

        # A description of the task.
        description:

        # The names of any tasks that must be executed, and the names of any services that must be running, before
        # this task is executed.
        # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in
        # template strings.
        dependencies:

        # Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable
        # tasks based on, for example, the current environment or other variables (e.g. `enabled: ${environment.name
        # != "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only
        # for development.
        #
        # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
        # dependency for another service, test or task.
        #
        # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
        # resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're
        # using them, using conditional expressions.
        disabled:

        # Maximum duration (in seconds) of the task's execution.
        timeout:

        # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time
        # your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when
        # its version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run`.
        cacheResult:

        # The task's specification, as defined by its provider plugin.
        spec:

    # List of tests configured by this module.
    testConfigs:
      - # The name of the test.
        name:

        # The names of any services that must be running, and the names of any tasks that must be executed, before the
        # test is run.
        dependencies:

        # Set this to `true` to disable the test. You can use this with conditional template strings to
        # enable/disable tests based on, for example, the current environment or other variables (e.g.
        # `enabled: ${environment.name != "prod"}`). This is handy when you only want certain tests to run in
        # specific environments, e.g. only during CI.
        disabled:

        # Maximum duration (in seconds) of the test run.
        timeout:

        # The configuration for the test, as specified by its module's provider.
        spec:

    # The module spec, as defined by the provider plugin.
    spec:

    # The name of the parent module (e.g. a templated module that generated this module), if applicable.
    parentName:

    # The module template that generated the module, if applicable.
    templateName:

    # Inputs provided when rendering the module from a module template, if applicable.
    inputs:
      <name>:

# All workflow configs in the project.
workflowConfigs:
  - kind:

    # The name of this workflow.
    name:

    # A description of the workflow.
    description:

    # A map of environment variables to use for the workflow. These will be available to all steps in the workflow.
    envVars:
      # Number, string or boolean
      <name>:

    # A list of files to write before starting the workflow.
    #
    # This is useful to e.g. create files required for provider authentication, and can be created from data stored in
    # secrets or templated strings.
    #
    # Note that you cannot reference provider configuration in template strings within this field, since they are
    # resolved after these files are generated. This means you can reference the files specified here in your provider
    # configurations.
    files:
      - # POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
        # or more directories, they are created automatically if necessary.
        # If any of those directories conflict with existing file paths, or if the file path conflicts with an
        # existing directory path, an error will be thrown.
        # **Any existing file with the same path will be overwritten, so be careful not to accidentally overwrite
        # files unrelated to your workflow.**
        path:

        # The file data as a string.
        data:

        # The name of a Garden secret to copy the file data from (Garden Cloud only).
        secretName:

    # The number of hours to keep the workflow pod running after completion.
    keepAliveHours:

    resources:
      requests:
        # The minimum amount of CPU the workflow needs in order to be scheduled, in millicpus (i.e. 1000 = 1 CPU).
        cpu:

        # The minimum amount of RAM the workflow needs in order to be scheduled, in megabytes (i.e. 1024 = 1 GB).
        memory:

      limits:
        # The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU).
        cpu:

        # The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB).
        memory:

    limits:
      # The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU).
      cpu:

      # The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB).
      memory:

    # The steps the workflow should run. At least one step is required. Steps are run sequentially. If a step fails,
    # subsequent steps are skipped.
    steps:
      - # An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
        # <number of step> is the sequential number of the step (first step being number 1).
        #
        # This identifier is useful when referencing command outputs in following steps. For example, if you set this
        # to "my-step", following steps can reference the ${steps.my-step.outputs.*} key in the `script` or `command`
        # fields.
        name:

        # A Garden command this step should run, followed by any required or optional arguments and flags.
        #
        # Note that commands that are _persistent_—e.g. the dev command, commands with a watch flag set, the logs
        # command with following enabled etc.—are not supported. In general, workflow steps should run to completion.
        #
        # Global options like --env, --log-level etc. are currently not supported for built-in commands, since they
        # are handled before the individual steps are run.
        command:

        # A description of the workflow step.
        description:

        # A map of environment variables to use when running script steps. Ignored for `command` steps.
        #
        # Note: Environment variables provided here take precedence over any environment variables configured at the
        # workflow level.
        envVars:
          # Number, string or boolean
          <name>:

        # A bash script to run. Note that the host running the workflow must have bash installed and on path.
        # It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an
        # error,
        # and the remainder of the workflow is aborted.
        #
        # The script may include template strings, including references to previous steps.
        script:

        # Set to true to skip this step. Use this with template conditionals to skip steps for certain environments or
        # scenarios.
        skip:

        # If used, this step will be run under the following conditions (may use template strings):
        #
        # `onSuccess` (default): This step will be run if all preceding steps succeeded or were skipped.
        #
        # `onError`: This step will be run if a preceding step failed, or if its preceding step has `when: onError`.
        # If the next step has `when: onError`, it will also be run. Otherwise, all subsequent steps are ignored.
        #
        # `always`: This step will always be run, regardless of whether any preceding steps have failed.
        #
        # `never`: This step will always be ignored.
        #
        # See the [workflows guide](https://docs.garden.io/cedar-0.14/features/workflows#the-skip-and-when-options)
        # for details
        # and examples.
        when:

        # Set to true to continue if the step errors.
        continueOnError:

    # A list of triggers that determine when the workflow should be run, and which environment should be used (Garden
    # Cloud only).
    triggers:
      - # The environment name (from your project configuration) to use for the workflow when matched by this trigger.
        environment:

        # The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for
        # this trigger's environment, as defined in your project's environment configs.
        namespace:

        # A list of [GitHub
        # events](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads) that
        # should trigger this workflow.
        #
        # See the Garden Cloud documentation on [configuring
        # workflows](https://cloud.docs.garden.io/getting-started/workflows) for more details.
        #
        # Supported events:
        #
        # `pull-request`, `pull-request-closed`, `pull-request-merged`, `pull-request-opened`,
        # `pull-request-reopened`, `pull-request-updated`, `push`
        #
        #
        events:

        # If specified, only run the workflow for branches matching one of these filters. These filters refer to the
        # pull/merge request's head branch (e.g. `my-feature-branch`), not the base branch that the pull/merge request
        # would be merged into if approved (e.g. `main`).
        branches:

        # If specified, only run the workflow for pull/merge requests whose base branch matches one of these filters.
        baseBranches:

        # If specified, do not run the workflow for branches matching one of these filters. These filters refer to the
        # pull/merge request's head branch (e.g. `my-feature-branch`), not the base branch that the pull/merge request
        # would be merged into if approved (e.g. `main`).
        ignoreBranches:

        # If specified, do not run the workflow for pull/merge requests whose base branch matches one of these
        # filters.
        ignoreBaseBranches:

# The name of the project.
projectName:

# The local path to the project root.
projectRoot:

# The project ID (Garden Cloud only).
projectId:

# The Garden Cloud domain (Garden Cloud only).
domain:

# All configured external project sources.
sources:
  - # The name of the source to import
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:

# A list of suggested commands to run in the project.
suggestedCommands:
  - # Name of the command
    name:

    # Short description of what the command does.
    description:

    # The source of the suggestion, e.g. a plugin name.
    source:

    # A Garden command to run (including arguments).
    gardenCommand:

    # A shell command to run.
    shellCommand:
      # The shell command to run (without arguments).
      command:

      # Arguments to pass to the command.
      args:

      # Absolute path to run the shell command in.
      cwd:

    # A URL to open in a browser window.
    openUrl:

    # The icon to display next to the command, where applicable (e.g. in dashboard or Garden Desktop).
    icon:
      # A string reference (and alt text) for the icon.
      name:

      # A URI for the image. May be a data URI.
      src:
```

### garden get files

**List all files from all or specified actions.**

This is useful to diagnose issues with ignores, include and exclude for a given action.

#### Usage

    garden get files [keys] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `keys` | No | One or more action keys (e.g. deploy.api), separated by spaces. If omitted, all actions are queried.


#### Outputs

```yaml
<name>:
```

### garden get linked-repos

**Outputs a list of all linked remote sources, actions and modules for this project.**


#### Usage

    garden get linked-repos 



### garden get outputs

**Resolves and returns the outputs of the project.**

Resolves and returns the outputs of the project. If necessary, this may involve deploying services and/or running
tasks referenced by the outputs in the project configuration.

Examples:

    garden get outputs                 # resolve and print the outputs from the project
    garden get outputs --env=prod      # resolve and print the outputs from the project for the prod environment
    garden get outputs --output=json   # resolve and return the project outputs in JSON format

#### Usage

    garden get outputs 


#### Outputs

```yaml
<name>:
```

### garden get modules

**Outputs all or specified modules.**

Outputs all or specified modules. Use with --output=json and jq to extract specific fields.

Examples:

    garden get modules                                                # list all modules in the project
    garden get modules --exclude-disabled=true                        # skip disabled modules
    garden get modules --full                                         # show resolved config for each module
    garden get modules -o=json | jq '.modules["my-module"].version'   # get version of my-module

#### Usage

    garden get modules [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | Specify module(s) to list. You may specify multiple modules, separated by spaces. Skip to return all modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--full` |  | boolean | Show the full config for each module, with template strings resolved. Has no effect when the --output option is used.
  | `--exclude-disabled` |  | boolean | Exclude disabled modules from output.

#### Outputs

```yaml
# Key/value map. Keys must be valid identifiers.
modules:
  # The configuration for a module.
  <name>:
    kind:

    # The type of this module.
    type:

    # The name of this module.
    name:

    # Specify how to build the module. Note that plugins may define additional keys on this object.
    build:
      # A list of modules that must be built before this module is built.
      dependencies:
        - # Module name to build ahead of this module.
          name:

          # Specify one or more files or directories to copy from the built dependency to this module.
          copy:
            - # POSIX-style path or filename of the directory or file(s) to copy to the target.
              source:

              # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
              # Defaults to the same as source path.
              target:

      # Maximum time in seconds to wait for build to finish.
      timeout:

    # If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
    # instead of in the Garden build directory (under .garden/build/<module-name>).
    #
    # Garden will therefore not stage the build for local modules. This means that include/exclude filters
    # and ignore files are not applied to local modules, except to calculate the module/action versions.
    #
    # If you use use `build.dependencies[].copy` for one or more build dependencies of this module, the copied files
    # will be copied to the module source directory (instead of the build directory, as is the default case when
    # `local = false`).
    #
    # Note: This maps to the `buildAtSource` option in this module's generated Build action (if any).
    local:

    # A description of the module.
    description:

    # Set this to `true` to disable the module. You can use this with conditional template strings to disable modules
    # based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name ==
    # "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for
    # development.
    #
    # Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.
    #
    # If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
    # will automatically ignore those dependency declarations. Note however that template strings referencing the
    # module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you
    # need to make sure to provide alternate values for those if you're using them, using conditional expressions.
    disabled:

    # Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files
    # that do *not* match these paths or globs are excluded when computing the version of the module, when responding
    # to filesystem watch events, and when staging builds.
    #
    # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
    # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
    # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
    # for details.
    #
    # Also note that specifying an empty list here means _no sources_ should be included.
    include:

    # Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match
    # these paths or globs are excluded when computing the version of the module, when responding to filesystem watch
    # events, and when staging builds.
    #
    # Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
    # field, the files/patterns specified here are filtered from the files matched by `include`. See the
    # [Configuration Files
    # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
    # for details.
    #
    # Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
    # directories are watched for changes. Use the project `scan.exclude` field to affect those, if you have large
    # directories that should not be watched for changes.
    exclude:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    #
    # Garden will import the repository source code into this module, but read the module's config from the local
    # garden.yml file.
    repositoryUrl:

    # When false, disables pushing this module to remote registries via the publish command.
    allowPublish:

    # A map of variables scoped to this particular module. These are resolved before any other parts of the module
    # configuration and take precedence over project-scoped variables. They may reference project-scoped variables,
    # and generally use any template strings normally allowed when resolving modules.
    variables:
      <name>:

    # Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
    # module-level `variables` field.
    #
    # The format of the files is determined by the configured file's extension:
    #
    # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
    # contain any value type. YAML format is used by default.
    # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
    # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
    #
    # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
    # nested objects and arrays._
    #
    # To use different module-level varfiles in different environments, you can template in the environment name
    # to the varfile name, e.g. `varfile: "my-module.${environment.name}.env` (this assumes that the corresponding
    # varfiles exist).
    varfile:

    # The filesystem path of the module.
    path:

    # The resolved build configuration of the module. If this is returned by the configure handler for the module
    # type, we can provide more granular versioning for the module, with a separate build version (i.e. module
    # version), as well as separate service, task and test versions, instead of applying the same version to all of
    # them.
    #
    # When this is specified, it is **very important** that this field contains all configurable (or otherwise
    # dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash of
    # those is separately computed).
    buildConfig:

    # List of services configured by this module.
    serviceConfigs:
      - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer
        # than 63 characters.
        name:

        # The names of any services that this service depends on at runtime, and the names of any tasks that should be
        # executed before this service is deployed.
        # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in
        # template strings.
        dependencies:

        # Set this to `true` to disable the service. You can use this with conditional template strings to
        # enable/disable services based on, for example, the current environment or other variables (e.g. `enabled:
        # ${environment.name != "prod"}`). This can be handy when you only need certain services for specific
        # environments, e.g. only for development.
        #
        # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a
        # runtime dependency for another service, test or task.
        #
        # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to
        # resolve when the service is disabled, so you need to make sure to provide alternate values for those if
        # you're using them, using conditional expressions.
        disabled:

        # The `validate` module action should populate this, if the service's code sources are contained in a separate
        # module from the parent module. For example, when the service belongs to a module that contains manifests
        # (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container module).
        sourceModuleName:

        # The service's specification, as defined by its provider plugin.
        spec:

    # List of tasks configured by this module.
    taskConfigs:
      - # The name of the task.
        name:

        # A description of the task.
        description:

        # The names of any tasks that must be executed, and the names of any services that must be running, before
        # this task is executed.
        # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in
        # template strings.
        dependencies:

        # Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable
        # tasks based on, for example, the current environment or other variables (e.g. `enabled: ${environment.name
        # != "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only
        # for development.
        #
        # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
        # dependency for another service, test or task.
        #
        # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
        # resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're
        # using them, using conditional expressions.
        disabled:

        # Maximum duration (in seconds) of the task's execution.
        timeout:

        # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time
        # your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when
        # its version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run`.
        cacheResult:

        # The task's specification, as defined by its provider plugin.
        spec:

    # List of tests configured by this module.
    testConfigs:
      - # The name of the test.
        name:

        # The names of any services that must be running, and the names of any tasks that must be executed, before the
        # test is run.
        dependencies:

        # Set this to `true` to disable the test. You can use this with conditional template strings to
        # enable/disable tests based on, for example, the current environment or other variables (e.g.
        # `enabled: ${environment.name != "prod"}`). This is handy when you only want certain tests to run in
        # specific environments, e.g. only during CI.
        disabled:

        # Maximum duration (in seconds) of the test run.
        timeout:

        # The configuration for the test, as specified by its module's provider.
        spec:

    # The module spec, as defined by the provider plugin.
    spec:

    # The name of the parent module (e.g. a templated module that generated this module), if applicable.
    parentName:

    # The module template that generated the module, if applicable.
    templateName:

    # Inputs provided when rendering the module from a module template, if applicable.
    inputs:
      <name>:

    # The path to the build staging directory for the module.
    buildPath:

    # A list of types that this module is compatible with (i.e. the module type itself + all bases).
    compatibleTypes:

    # The path to the module config file, if applicable.
    configPath:

    version:
      # The hash of all files belonging to the Garden action/module.
      contentHash:

      # A Stack Graph node (i.e. module, service, task or test) version.
      versionString:

      # The version of each of the dependencies of the module.
      dependencyVersions:
        # version hash of the dependency module
        <name>:

      # List of file paths included in the version.
      files:

    # A map of all modules referenced under `build.dependencies`.
    buildDependencies:
      <name>:

    # Indicate whether the module needs to be built (i.e. has a build handler or needs to copy dependencies).
    needsBuild:

    # The outputs defined by the module (referenceable in other module configs).
    outputs:
      <name>:

    # The names of the services that the module provides.
    serviceNames:

    # The names of all the services and tasks that the services in this module depend on.
    serviceDependencyNames:

    # The names of the tasks that the module provides.
    taskNames:

    # The names of all the tasks and services that the tasks in this module depend on.
    taskDependencyNames:
```

### garden get status

**Outputs the full status of your project/environment and all actions.**


#### Usage

    garden get status [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--skip-detail` |  | boolean | Skip plugin specific details. Only applicable when using the --output&#x3D;json|yaml option. Useful for trimming down the output.

#### Outputs

```yaml
# A map of statuses for each configured provider.
providers:
  # Description of an environment's status for a provider.
  <name>:
    # Set to true if the environment is fully configured for a provider.
    ready:

    # Use this to include additional information that is specific to the provider.
    detail:

    # Output variables that modules and other variables can reference.
    outputs:
      <name>:

    # Set to true to disable caching of the status.
    disableCache:

actions:
  # A map of statuses for each configured Build.
  Build:
    <name>:
      # The state of the action.
      state:

      # Optional provider-specific information about the action status or results.
      detail:

      # Structured outputs from the execution, as defined by individual action/module types, to be made available for
      # dependencies and in templating.
      outputs:
        <name>:

      # Set to true if the action handler is running a process persistently and attached to the Garden process after
      # returning.
      attached:

  # A map of statuses for each configured Deploy.
  Deploy:
    <name>:
      # The state of the action.
      state:

      # Structured outputs from the execution, as defined by individual action/module types, to be made available for
      # dependencies and in templating.
      outputs:
        <name>:

      # Set to true if the action handler is running a process persistently and attached to the Garden process after
      # returning.
      attached:

      detail:
        # When the service was first deployed by the provider.
        createdAt:

        # Additional detail, specific to the provider.
        detail:

        # The mode the action is deployed in.
        mode:

        # The ID used for the service by the provider (if not the same as the service name).
        externalId:

        # The provider version of the deployed service (if different from the Garden module version.
        externalVersion:

        # A list of ports that can be forwarded to from the Garden agent by the provider.
        forwardablePorts:
          - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
            name:

            # The preferred local port to use for forwarding.
            preferredLocalPort:

            # The protocol of the port.
            protocol:

            # The target name/hostname to forward to (defaults to the service name).
            targetName:

            # The target port on the service.
            targetPort:

            # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
            urlProtocol:

        # List of currently deployed ingress endpoints for the service.
        ingresses:
          - # The port number that the service is exposed on internally.
            # This defaults to the first specified port for the service.
            port:

            # The ingress path that should be matched to route to this service.
            path:

            # The protocol to use for the ingress.
            protocol:

            # The hostname where the service can be accessed.
            hostname:

        # Latest status message of the service (if any).
        lastMessage:

        # Latest error status message of the service (if any).
        lastError:

        # A map of values output from the deployment.
        outputs:
          <name>:

        # How many replicas of the service are currently running.
        runningReplicas:

        # The current deployment status of the service.
        state:

        # When the service was last updated by the provider.
        updatedAt:

        # The Garden module version of the deployed service.
        version:

  # A map of statuses for each configured Run.
  Run:
    <name>:
      # The state of the action.
      state:

      # Structured outputs from the execution, as defined by individual action/module types, to be made available for
      # dependencies and in templating.
      outputs:
        <name>:

      # Set to true if the action handler is running a process persistently and attached to the Garden process after
      # returning.
      attached:

      detail:
        # Whether the module was successfully run.
        success:

        # The exit code of the run (if applicable).
        exitCode:

        # When the module run was started.
        startedAt:

        # When the module run was completed.
        completedAt:

        # The output log from the run.
        log:

        # An error message from the plugin.
        errorMsg:

        # An optional, more detailed diagnostic error message from the plugin.
        diagnosticErrorMsg:

  # A map of statuses for each configured Test.
  Test:
    <name>:
      # The state of the action.
      state:

      # Structured outputs from the execution, as defined by individual action/module types, to be made available for
      # dependencies and in templating.
      outputs:
        <name>:

      # Set to true if the action handler is running a process persistently and attached to the Garden process after
      # returning.
      attached:

      detail:
        # Whether the module was successfully run.
        success:

        # The exit code of the run (if applicable).
        exitCode:

        # When the module run was started.
        startedAt:

        # When the module run was completed.
        completedAt:

        # The output log from the run.
        log:

        # An error message from the plugin.
        errorMsg:

        # An optional, more detailed diagnostic error message from the plugin.
        diagnosticErrorMsg:
```

### garden get actions

**Outputs all or specified actions.**

Outputs all or specified actions. Use with --output=json and jq to extract specific fields.

Examples:

  garden get actions                                  # list all actions in the project
  garden get actions --include-state                  # list all actions in the project with state in output
  garden get actions --detail                         # list all actions in project with detailed info
  garden get actions --kind deploy                    # only list the actions of kind 'Deploy'
  garden get actions a b --kind build --sort type     # list actions 'a' and 'b' of kind 'Build' sorted by type
  garden get actions build.a deploy.b                 # list actions 'build.a' and 'deploy.b'
  garden get actions --include-state -o=json          # get json output

#### Usage

    garden get actions [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | Specify name(s) of the action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all actions.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--detail` |  | boolean | Show the detailed info for each action, including path, dependencies, dependents, associated module and if the action is disabled.
  | `--include-state` |  | boolean | Include state of action(s) in output.
  | `--sort` |  | `name` `kind` `type`  | Sort the actions result by action name, kind or type. By default action results are sorted by name.
  | `--kind` |  | `build` `deploy` `run` `test`  | Choose actions of specific kind only. By default all actions are shown.

#### Outputs

```yaml
# A list of the actions.
actions:
  - name:

    # Action kind (e.g. Build).
    kind:

    # Action Type (e.g. 'container').
    type:

    # The state of the action.
    state:

    # The relative path of the action config file.
    path:

    # Flag to identify if action is disabled.
    disabled:

    # Object with the full version information of the action.
    version:
      # The version string of the action's config.
      configVersion:

      # The version string of the action's source.
      sourceVersion:

      # The version string of the action.
      versionString:

      # Map with the version strings of the action's dependencies.
      dependencyVersions:
        <name>:

      # List of the files included in the action.
      files:

    # Flag to identify whether publishing the build is enabled. Only available for build actions.
    allowPublish:

    # The image ID used to publish the image of the action. Only available for build actions.
    publishId:

    # The name of the module the action is derived from. Only available for converted actions.
    moduleName:

    # List of references of all dependencies of the action.
    dependencies:

    # List of references of all the dependents of the action.
    dependents:
```

### garden get deploys

**Lists the deploy actions defined in your project.**

Lists all or specified deploy action(s). Use with --output=json and jq to extract specific fields.

Examples:

  garden get deploys                      # list all deploy actions in the project
  garden get deploys --include-state      # list all deploy actions in the project including action state in output
  garden get deploys --detail             # list all deploy actions in project with detailed info
  garden get deploys A B --sort type      # list only deploy actions A and B sorted by type

#### Usage

    garden get deploys [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | Specify name(s) of the deploy action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all deploy actions.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--detail` |  | boolean | Show the detailed info for each deploy action, including path, dependencies, dependents, associated module and if the deploy action is disabled.
  | `--include-state` |  | boolean | Include state of deploy(s) in output.
  | `--sort` |  | `name` `type`  | Sort the deploy actions result by action name or type. By default deploy action results are sorted by name.

#### Outputs

```yaml
# A list of the deploy actions.
actions:
  - name:

    # Action kind (e.g. Build).
    kind:

    # Action Type (e.g. 'container').
    type:

    # The state of the action.
    state:

    # The relative path of the action config file.
    path:

    # Flag to identify if action is disabled.
    disabled:

    # Object with the full version information of the action.
    version:
      # The version string of the action's config.
      configVersion:

      # The version string of the action's source.
      sourceVersion:

      # The version string of the action.
      versionString:

      # Map with the version strings of the action's dependencies.
      dependencyVersions:
        <name>:

      # List of the files included in the action.
      files:

    # Flag to identify whether publishing the build is enabled. Only available for build actions.
    allowPublish:

    # The image ID used to publish the image of the action. Only available for build actions.
    publishId:

    # The name of the module the action is derived from. Only available for converted actions.
    moduleName:

    # List of references of all dependencies of the action.
    dependencies:

    # List of references of all the dependents of the action.
    dependents:
```

### garden get builds

**Lists the build actions defined in your project.**

Lists all or specified build action(s). Use with --output=json and jq to extract specific fields.

Examples:

  garden get builds                      # list all build actions in the project
  garden get builds --include-state      # list all build actions in the project including action state in output
  garden get builds --detail             # list all build actions in project with detailed info
  garden get builds A B --sort type      # list only build actions A and B sorted by type

#### Usage

    garden get builds [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | Specify name(s) of the build action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all build actions.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--detail` |  | boolean | Show the detailed info for each build action, including path, dependencies, dependents, associated module and if the build action is disabled.
  | `--include-state` |  | boolean | Include state of build(s) in output.
  | `--sort` |  | `name` `type`  | Sort the build actions result by action name or type. By default build action results are sorted by name.

#### Outputs

```yaml
# A list of the build actions.
actions:
  - name:

    # Action kind (e.g. Build).
    kind:

    # Action Type (e.g. 'container').
    type:

    # The state of the action.
    state:

    # The relative path of the action config file.
    path:

    # Flag to identify if action is disabled.
    disabled:

    # Object with the full version information of the action.
    version:
      # The version string of the action's config.
      configVersion:

      # The version string of the action's source.
      sourceVersion:

      # The version string of the action.
      versionString:

      # Map with the version strings of the action's dependencies.
      dependencyVersions:
        <name>:

      # List of the files included in the action.
      files:

    # Flag to identify whether publishing the build is enabled. Only available for build actions.
    allowPublish:

    # The image ID used to publish the image of the action. Only available for build actions.
    publishId:

    # The name of the module the action is derived from. Only available for converted actions.
    moduleName:

    # List of references of all dependencies of the action.
    dependencies:

    # List of references of all the dependents of the action.
    dependents:
```

### garden get runs

**Lists the run actions defined in your project.**

Lists all or specified run action(s). Use with --output=json and jq to extract specific fields.

Examples:

  garden get runs                      # list all run actions in the project
  garden get runs --include-state      # list all run actions in the project including action state in output
  garden get runs --detail             # list all run actions in project with detailed info
  garden get runs A B --sort type      # list only run actions A and B sorted by type

#### Usage

    garden get runs [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | Specify name(s) of the run action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all run actions.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--detail` |  | boolean | Show the detailed info for each run action, including path, dependencies, dependents, associated module and if the run action is disabled.
  | `--include-state` |  | boolean | Include state of run(s) in output.
  | `--sort` |  | `name` `type`  | Sort the run actions result by action name or type. By default run action results are sorted by name.

#### Outputs

```yaml
# A list of the run actions.
actions:
  - name:

    # Action kind (e.g. Build).
    kind:

    # Action Type (e.g. 'container').
    type:

    # The state of the action.
    state:

    # The relative path of the action config file.
    path:

    # Flag to identify if action is disabled.
    disabled:

    # Object with the full version information of the action.
    version:
      # The version string of the action's config.
      configVersion:

      # The version string of the action's source.
      sourceVersion:

      # The version string of the action.
      versionString:

      # Map with the version strings of the action's dependencies.
      dependencyVersions:
        <name>:

      # List of the files included in the action.
      files:

    # Flag to identify whether publishing the build is enabled. Only available for build actions.
    allowPublish:

    # The image ID used to publish the image of the action. Only available for build actions.
    publishId:

    # The name of the module the action is derived from. Only available for converted actions.
    moduleName:

    # List of references of all dependencies of the action.
    dependencies:

    # List of references of all the dependents of the action.
    dependents:
```

### garden get tests

**Lists the test actions defined in your project.**

Lists all or specified test action(s). Use with --output=json and jq to extract specific fields.

Examples:

  garden get tests                      # list all test actions in the project
  garden get tests --include-state      # list all test actions in the project including action state in output
  garden get tests --detail             # list all test actions in project with detailed info
  garden get tests A B --sort type      # list only test actions A and B sorted by type

#### Usage

    garden get tests [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | Specify name(s) of the test action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all test actions.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--detail` |  | boolean | Show the detailed info for each test action, including path, dependencies, dependents, associated module and if the test action is disabled.
  | `--include-state` |  | boolean | Include state of test(s) in output.
  | `--sort` |  | `name` `type`  | Sort the test actions result by action name or type. By default test action results are sorted by name.

#### Outputs

```yaml
# A list of the test actions.
actions:
  - name:

    # Action kind (e.g. Build).
    kind:

    # Action Type (e.g. 'container').
    type:

    # The state of the action.
    state:

    # The relative path of the action config file.
    path:

    # Flag to identify if action is disabled.
    disabled:

    # Object with the full version information of the action.
    version:
      # The version string of the action's config.
      configVersion:

      # The version string of the action's source.
      sourceVersion:

      # The version string of the action.
      versionString:

      # Map with the version strings of the action's dependencies.
      dependencyVersions:
        <name>:

      # List of the files included in the action.
      files:

    # Flag to identify whether publishing the build is enabled. Only available for build actions.
    allowPublish:

    # The image ID used to publish the image of the action. Only available for build actions.
    publishId:

    # The name of the module the action is derived from. Only available for converted actions.
    moduleName:

    # List of references of all dependencies of the action.
    dependencies:

    # List of references of all the dependents of the action.
    dependents:
```

### garden get run-result

**Outputs the latest result of a run (or task, if using modules).**


#### Usage

    garden get run-result <name> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `name` | Yes | The name of the run (or task, if using modules)


#### Outputs

```yaml
# The state of the action.
state:

# Structured outputs from the execution, as defined by individual action/module types, to be made available for
# dependencies and in templating.
outputs:
  <name>:

# Set to true if the action handler is running a process persistently and attached to the Garden process after
# returning.
attached:

detail:
  # Whether the module was successfully run.
  success:

  # The exit code of the run (if applicable).
  exitCode:

  # When the module run was started.
  startedAt:

  # When the module run was completed.
  completedAt:

  # The output log from the run.
  log:

  # An error message from the plugin.
  errorMsg:

  # An optional, more detailed diagnostic error message from the plugin.
  diagnosticErrorMsg:

# Local file paths to any exported artifacts from the Run's execution.
artifacts:
```

### garden get test-result

**Outputs the latest execution result of a provided test.**


#### Usage

    garden get test-result <name> [moduleTestName] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `name` | Yes | The name of the test. If this test belongs to a module, specify the module name here instead, and specify the test name from the module in the second argument.
  | `moduleTestName` | No | When the test belongs to a module, specify its name here (i.e. as the second argument).


#### Outputs

```yaml
# The state of the action.
state:

# Structured outputs from the execution, as defined by individual action/module types, to be made available for
# dependencies and in templating.
outputs:
  <name>:

# Set to true if the action handler is running a process persistently and attached to the Garden process after
# returning.
attached:

detail:
  # Whether the module was successfully run.
  success:

  # The exit code of the run (if applicable).
  exitCode:

  # When the module run was started.
  startedAt:

  # When the module run was completed.
  completedAt:

  # The output log from the run.
  log:

  # An error message from the plugin.
  errorMsg:

  # An optional, more detailed diagnostic error message from the plugin.
  diagnosticErrorMsg:

# Local file paths to any exported artifacts from the test run.
artifacts:
```

### garden get debug-info

**Outputs the status of your environment for debug purposes.**

Examples:

garden get debug-info                    # create a zip file at the root of the project with debug information
garden get debug-info --format yaml      # output provider info as YAML files (default is JSON)
garden get debug-info --include-project  # include provider info for the project namespace (disabled by default)

#### Usage

    garden get debug-info [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--format` |  | `json` `yaml`  | The output format for plugin-generated debug info.
  | `--include-project` |  | boolean | Include project-specific information from configured providers.
Note that this may include sensitive data, depending on the provider and your configuration.


### garden get workflows

**Lists the workflows defined in your project.**


#### Usage

    garden get workflows [workflows] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `workflows` | No | Specify workflow(s) to list. You may specify multiple workflows, separated by spaces.



### garden get variables

**Get variables**

List variables in this project, both those those defined in the project configuration and in individual actions, and including remote variables
and variables from varfiles. This is useful for seeing where variables are set and what value they resolve to when using template strings.

Note that by default, template strings are not resolved for action-level variables. To resolve all template
strings, use the `--resolve=full` option. Note that this may trigger actions being executed in case a given
action references the runtime output of another in its `variables` field.

Examples:
    garden get variables                                                         # list all variables and pretty print results
    garden get variables --resolve full                                          # list all variables and resolve template strings, including runtime outputs
    garden get variables --filter-actions build.api --filter-actions deploy.api  # list variables for the Build api and Deploy api actions
    garden get variables --output json                                           # return variables as a JSON object, useful for scripting

#### Usage

    garden get variables [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--resolve` |  | `full` `partial`  | Choose level of resolution of variables. Defaults to &#x60;partial&#x60; which means that template strings in
action-level variables are not resolved and the raw template string is returned. Use &#x60;--resolve&#x3D;full&#x60;
to resolve the full value but note that this may trigger actions being executed in case a given action
references the runtime output of another in its &#x60;variables&#x60; field.
  | `--exclude-disabled` |  | boolean | Exclude disabled actions and from output.
  | `--filter-actions` |  | array:string | Filter by action using &lt;actionKind&gt;.&lt;actionName&gt;. You may specify multiple names, separated by spaces. For
example &#x60;--filter-actions build.api --filter-actions deploy.api&quot;&#x60; (or &#x60;--filter-actions build.api,deploy.api&#x60;).

#### Outputs

```yaml
# A list of variables
variables:
  - name:

    value:

    source:

    isSecret:

    details:

    action:

    path:
```

### garden get users

**Get users**

List the users that belong to this Garden Cloud organization (i.e. in https://app.garden.io). Only relevant
for projects that are connected to Garden Cloud and have an `organizationId` set in the project configuration.

See the [Connecting a project guide](https://docs.garden.io/cedar-0.14/guides/connecting-project) to learn more about
connecting projects to Garden Cloud.

Examples:
    garden get users                    # list users and pretty print results
    garden get users --current-user     # show only the current user
    garden get users --output json      # returns users as a JSON object, useful for scripting

#### Usage

    garden get users [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--current-user` |  | boolean | Only show the current user.

#### Outputs

```yaml
# A list of users
users:
  - name:

    id:

    email:

    role:

    # Whether this is the current user.
    isCurrent:
```

### garden get variable-lists

**Get variable lists**

List the variable lists that belong to this Garden Cloud organization (i.e. in https://app.garden.io). Only relevant
for projects that are connected to Garden Cloud and have an `organizationId` set in the project configuration.

See the [Connecting a project guide](https://docs.garden.io/cedar-0.14/guides/connecting-project) to learn more about
connecting projects to Garden Cloud.

Variable lists are used to group together remote variables and this command can be used to get
the variable list IDs that are needed for the `garden create cloud-variables` command.

Examples:
    garden get variable-lists                 # list variable lists and pretty print results
    garden get variable-lists --output json   # returns variable lists as a JSON object, useful for scripting

See the [Variables and Templating guide](https://docs.garden.io/cedar-0.14/features/variables-and-templating) for more information.

#### Usage

    garden get variable-lists 


#### Outputs

```yaml
# A list of variable lists
variableLists:
  - name:

    id:

    description:
```

### garden get remote-variables

**Get remote variables from Garden Cloud**

List the remote variables that belong to this Garden Cloud organization (i.e. in https://app.garden.io). Only relevant
for projects that are connected to Garden Cloud and have an `organizationId` set in the project configuration.

See the [Connecting a project guide](https://docs.garden.io/cedar-0.14/guides/connecting-project) to learn more about
connecting projects to Garden Cloud.

List all remote variables for the variable lists configured in this project. This is useful for
seeing the IDs of remote variables (e.g. for use with the `garden delete remote-variables` command)
and for viewing cloud-specific information such as scoping and expiration.

Examples:
    garden get remote-variables                 # list remote variables and pretty print results
    garden get remote-variables --output json   # returns remote variables as a JSON object, useful for scripting

See the [Variables and Templating guide](https://docs.garden.io/cedar-0.14/features/variables-and-templating) for more information.

#### Usage

    garden get remote-variables 


#### Outputs

```yaml
# A list of remote variables
variables:
  - name:

    id:

    value:

    isSecret:

    variableListName:

    environmentScope:

    userScope:

    expiresAt:

    description:
```

### garden link source

**Link a remote source to a local directory.**

After linking a remote source, Garden will read it from its local directory instead of
from the remote URL. Garden can only link remote sources that have been declared in the project
level `garden.yml` config.

Examples:

    garden link source my-source path/to/my-source # links my-source to its local version at the given path

#### Usage

    garden link source <source> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `source` | Yes | Name of the source to link as declared in the project config.
  | `path` | Yes | Path to the local directory that contains the source.


#### Outputs

```yaml
# A list of all locally linked external sources.
sources:
  - # The name of the linked source.
    name:

    # The local directory path of the linked repo clone.
    path:
```

### garden link action

**Link a remote action to a local directory.**

After linking a remote action, Garden will read the source from the linked local directory instead of the remote repository. Garden can only link actions that have a remote source, i.e. actions that specify a `source.repository.url` in their configuration.

Examples:

    garden link action build.my-build path/to/my-build # links Build my-build to its local version at the given path

#### Usage

    garden link action <action> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `action` | Yes | The full key of the action (e.g. deploy.api).
  | `path` | Yes | Path to the local directory that contains the action.


#### Outputs

```yaml
# A list of all locally linked remote actions.
sources:
  - # The key of the linked action.
    name:

    # The local directory path of the linked repo clone.
    path:
```

### garden link module

**Link a remote module to a local directory.**

After linking a remote module, Garden will read the source from the module's local directory instead of from
the remote URL. Garden can only link modules that have a remote source,
i.e. modules that specify a `repositoryUrl` in their `garden.yml` config file.

Examples:

    garden link module my-module path/to/my-module # links my-module to its local version at the given path

#### Usage

    garden link module <module> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Name of the module to link.
  | `path` | Yes | Path to the local directory that contains the module.


#### Outputs

```yaml
# A list of all locally linked external modules.
sources:
  - # The name of the linked module.
    name:

    # The local directory path of the linked repo clone.
    path:
```

### garden login

**Log in to Garden Cloud.**

Logs you in to Garden Cloud. Subsequent commands will have access to cloud features.

#### Usage

    garden login 



### garden logout

**Log out of Garden Cloud.**

Logs you out of Garden Cloud.

#### Usage

    garden logout 



### garden logs

**Retrieves the most recent logs for the specified Deploy(s).**

Outputs logs for all or specified Deploys, and optionally waits for new logs to come in.
Defaults to getting logs from the last minute when in `--follow` mode. You can change this with the `--since` or `--tail` options.

Examples:

    garden logs                            # interleaves color-coded logs from all Deploys (up to a certain limit)
    garden logs --since 2d                 # interleaves color-coded logs from all Deploys from the last 2 days
    garden logs --tail 100                 # interleaves the last 100 log lines from all Deploys
    garden logs deploy-a,deploy-b          # interleaves color-coded logs for deploy-a and deploy-b
    garden logs --follow                   # keeps running and streams all incoming logs to the console
    garden logs --tag container=service-a  # only shows logs from containers with names matching the pattern

#### Usage

    garden logs [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the Deploy(s) to log (skip to get logs from all Deploys in the project). You may specify multiple names, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--tag` |  | array:tag | Only show log lines that match the given tag, e.g. &#x60;--tag &#x27;container&#x3D;foo&#x27;&#x60;. If you specify multiple filters in a single tag option (e.g. &#x60;--tag &#x27;container&#x3D;foo,someOtherTag&#x3D;bar&#x27;&#x60;), they must all be matched. If you provide multiple &#x60;--tag&#x60; options (e.g. &#x60;--tag &#x27;container&#x3D;api&#x27; --tag &#x27;container&#x3D;frontend&#x27;&#x60;), they will be OR-ed together (i.e. if any of them match, the log line will be included). You can specify glob-style wildcards, e.g. &#x60;--tag &#x27;container&#x3D;prefix-*&#x27;&#x60;.
  | `--follow` |  | boolean | Continuously stream new logs. When the &#x60;--follow&#x60; option is set, we default to &#x60;--since 1m&#x60;.
  | `--tail` |  | number | Number of lines to show for each deployment. Defaults to showing all log lines (up to a certain limit). Takes precedence over the &#x60;--since&#x60; flag if both are set. Note that we don&#x27;t recommend using a large value here when in follow mode.
  | `--show-tags` |  | boolean | Show any tags attached to each log line. May not apply to all providers
  | `--timestamps` |  | boolean | Show timestamps with log output.
  | `--since` |  | moment | Only show logs newer than a relative duration like 5s, 2m, or 3h. Defaults to &#x60;&quot;1m&quot;&#x60; when &#x60;--follow&#x60; is true unless &#x60;--tail&#x60; is set. Note that we don&#x27;t recommend using a large value here when in follow mode.
  | `--hide-name` |  | boolean | Hide the action name and render the logs directly.


### garden options

**Print global options.**

Prints all global options (options that can be applied to any command).

#### Usage

    garden options 



### garden plan

**[EXPERIMENTAL] Show what actions would be executed without making any changes.**

**[EXPERIMENTAL] This command is still under development and may change in the future, including parameters and output format.**

Shows what would happen if you ran the specified actions, without actually executing them.
This is useful for previewing changes before deployment, especially for Kubernetes resources.

For Deploy actions, shows a diff of resources that would be created, updated, or deleted.
For Build, Run, and Test actions, shows what commands would be executed.

Examples:

    garden plan                         # plan all actions in the project
    garden plan deploy.api              # plan a specific Deploy action
    garden plan deploy.*                # plan all Deploy actions
    garden plan build.* deploy.*        # plan all Build and Deploy actions
    garden plan "*.api"                 # plan all actions named "api"
    garden plan --skip deploy.database  # plan everything except the database deploy
    garden plan --force                 # plan all actions, ignoring cache

#### Usage

    garden plan [keys] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `keys` | No | The key(s) of the action(s) to plan (e.g., deploy.api, build.*, run.db-migrate).
You may specify multiple keys, separated by spaces.
Accepts glob patterns (e.g., deploy.* would plan all Deploy actions).
Skip to plan all actions in the project.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Plan all actions, even if cached results exist.
  | `--skip` |  | array:string | The key(s) of actions you&#x27;d like to skip. Accepts glob patterns
(e.g., deploy.* would skip all Deploy actions).

#### Outputs

```yaml
# Set to true if the command execution was aborted.
aborted:

# Set to false if the command execution was unsuccessful.
success:

# A map of all executed Builds (or Builds scheduled/attempted) and information about them.
build:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about
# them. Please do not use this alias, it will be removed in a future release.
builds:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.
deploy:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy
# status. Please do not use this alias, it will be removed in a future release.
deployments:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all Tests that were executed (or scheduled/attempted) and the Test results.
test:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results.
# Please do not use this alias, it will be removed in a future release.
tests:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all Runs that were executed (or scheduled/attempted) and the Run results.
run:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results.
# Please do not use this alias, it will be removed in a future release.
tasks:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:
```

### garden plugins

**Plugin-specific commands.**

Execute a command defined by a plugin in your project.
Run without arguments to get a list of all plugin commands available.
Run with just the plugin name to get a list of commands provided by that plugin.

Examples:

    # Run the `cleanup-cluster-registry` command from the `kubernetes` plugin.
    garden plugins kubernetes cleanup-cluster-registry

    # List all available commands.
    garden plugins

    # List all the commands from the `kubernetes` plugin.
    garden plugins kubernetes

#### Usage

    garden plugins [plugin] [command] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `plugin` | No | The name of the plugin, whose command you wish to run.
  | `command` | No | The name of the command to run.



### garden publish

**Build and publish artifacts (e.g. container images) to a remote registry.**

Publishes built artifacts for all or specified builds. Also builds dependencies if needed.

By default the artifacts/images are tagged with the Garden action version,
but you can also specify the `--tag` option to specify a specific string tag _or_ a templated tag.
Any template values that can be used on the build being tagged are available,
in addition to ${build.name}, ${build.version} and ${build.hash}
tags that allows referencing the name of the build being tagged, as well as its Garden version.
${build.version} includes the "v-" prefix normally used for Garden versions, ${build.hash} doesn't.

Examples:

    garden publish                # publish artifacts for all builds in the project
    garden publish my-container   # only publish my-container
    garden publish --force-build  # force re-build before publishing artifacts

    # Publish my-container with a tag of v0.1
    garden publish my-container --tag "v0.1"

    # Publish my-container with a tag of v1.2-<hash> (e.g. v1.2-abcdef123)
    garden publish my-container --tag "v1.2-${build.hash}"

#### Usage

    garden publish [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the builds (or modules) to publish (skip to publish every build). You may specify multiple names, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force-build` |  | boolean | Force rebuild before publishing.
  | `--tag` |  | string | Override the tag on the built artifacts. You can use the same sorts of template strings as when templating values in configs, with the addition of ${build.*} tags, allowing you to reference the name and Garden version of the module being tagged.

#### Outputs

```yaml
# Set to true if the command execution was aborted.
aborted:

# Set to false if the command execution was unsuccessful.
success:

# A map of all executed Builds (or Builds scheduled/attempted) and information about them.
build:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about
# them. Please do not use this alias, it will be removed in a future release.
builds:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.
deploy:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy
# status. Please do not use this alias, it will be removed in a future release.
deployments:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all Tests that were executed (or scheduled/attempted) and the Test results.
test:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results.
# Please do not use this alias, it will be removed in a future release.
tests:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all Runs that were executed (or scheduled/attempted) and the Run results.
run:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results.
# Please do not use this alias, it will be removed in a future release.
tasks:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all builds that were published (or scheduled/attempted for publishing) and the results.
published:
  <name>:
    # The state of the action.
    state:

    # Set to true if the action handler is running a process persistently and attached to the Garden process after
    # returning.
    attached:

    detail:
      # Set to true if the build was published.
      published:

      # Optional result message from the provider.
      message:

      # The published artifact identifier, if applicable.
      identifier:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:
```

### garden run

**Perform one or more Run actions**

This is useful for any ad-hoc Runs, for example database migrations, or when developing.

Examples:

    garden run my-db-migration   # run my-db-migration
    garden run my-run -l 3       # run with verbose log level to see the live log output

#### Usage

    garden run [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the Run action(s) to perform. You may specify multiple names, separated by spaces. Accepts glob patterns (e.g. init* would run both &#x27;init&#x27; and &#x27;initialize&#x27;).

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Run even if the action is disabled for the environment, and/or a successful result is found in cache.
  | `--force-build` |  | boolean | Force re-build of Build dependencies before running.
  | `--module` |  | array:string | The name(s) of one or modules to pull Runs (or tasks if using modules) from. If both this and Run names are specified, the Run names filter the tasks found in the specified modules.
  | `--skip` |  | array:string | The name(s) of Runs you&#x27;d like to skip. Accepts glob patterns (e.g. init* would skip both &#x27;init&#x27; and &#x27;initialize&#x27;).
  | `--skip-dependencies` |  | boolean | Don&#x27;t perform any Deploy or Run actions that the requested Runs depend on.
This can be useful e.g. when your stack has already been deployed, and you want to run Tests with runtime
dependencies without redeploying any Deploy (or service if using modules) dependencies that may have changed since you last deployed.

Warning: Take great care when using this option in CI, since Garden won&#x27;t ensure that the runtime dependencies of
your test suites are up to date when this option is used.

#### Outputs

```yaml
# Set to true if the command execution was aborted.
aborted:

# Set to false if the command execution was unsuccessful.
success:

# A map of all executed Builds (or Builds scheduled/attempted) and information about them.
build:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about
# them. Please do not use this alias, it will be removed in a future release.
builds:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.
deploy:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy
# status. Please do not use this alias, it will be removed in a future release.
deployments:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all Tests that were executed (or scheduled/attempted) and the Test results.
test:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results.
# Please do not use this alias, it will be removed in a future release.
tests:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all Runs that were executed (or scheduled/attempted) and the Run results.
run:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results.
# Please do not use this alias, it will be removed in a future release.
tasks:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:
```

### garden workflow

**Run a Workflow.**

Runs the commands and/or scripts defined in the workflow's steps, in sequence.

Examples:

    garden workflow my-workflow

#### Usage

    garden workflow <workflow> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `workflow` | Yes | The name of the workflow to be run.



### garden self-update

**Update the Garden CLI.**

Updates your Garden CLI in-place.

Defaults to the latest minor release version, but you can also request a specific release version as an argument.

Examples:

   garden self-update               # update to the latest minor Garden CLI version
   garden self-update edge-acorn    # switch to the latest edge build of garden Acorn (0.12)
   garden self-update edge-bonsai   # switch to the latest edge build of garden Bonsai (0.13)
   garden self-update edge-cedar    # switch to the latest edge build of garden Cedar (0.14)
   garden self-update 0.13.55       # switch to the exact version 0.13.55 of the CLI
   garden self-update --major       # install the latest version, even if it's a major bump
   garden self-update --force       # re-install even if the same version is detected
   garden self-update --install-dir ~/garden  # install to ~/garden instead of detecting the directory

#### Usage

    garden self-update [version] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `version` | No | Specify which version to switch/update to. It can be either a stable release, a pre-release, or an edge release version.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Install the Garden CLI even if the specified or detected latest version is the same as the current version.
  | `--install-dir` |  | string | Specify an installation directory, instead of using the directory of the Garden CLI being used. Implies --force.
  | `--platform` |  | `macos` `linux` `alpine` `windows`  | Override the platform, instead of detecting it automatically.
  | `--architecture` |  | `arm64` `amd64`  | Override the architecture, instead of detecting it automatically.
  | `--major` |  | boolean | Install the latest major version of Garden. Falls back to the current version if the greater major version does not exist.

Note! If you use a non-stable version (i.e. pre-release, or draft, or edge), then the latest possible major version will be installed.


### garden sync start

**Start any configured syncs to the given Deploy action(s).**

Start a sync between your local project directory and one or more Deploys.

Examples:
    # start syncing to the 'api' Deploy, fail if it's not already deployed in sync mode
    garden sync start api

    # deploy 'api' in sync mode and dependencies if needed, then start syncing
    garden sync start api --deploy

    # start syncing to every Deploy already deployed in sync mode
    garden sync start

    # start syncing to every Deploy that supports it, deploying if needed
    garden sync start '*' --deploy

    # start syncing to every Deploy that supports it, deploying if needed including runtime dependencies
    garden sync start --deploy --include-dependencies

    # start syncing to the 'api' and 'worker' Deploys
    garden sync start api worker

    # start syncing to the 'api' Deploy and keep the process running, following sync status messages
    garden sync start api -f

#### Usage

    garden sync start [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of one or more Deploy(s) (or services if using modules) to sync. You may specify multiple names, separated by spaces. To start all possible syncs, specify &#x27;*&#x27; as an argument.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--deploy` |  | boolean | Deploy the specified actions, if they&#x27;re out of date and/or not deployed in sync mode.
  | `--with-dependencies` |  | boolean | When deploying actions, also include any runtime dependencies. Ignored if --deploy is not set.
  | `--monitor` |  | boolean | Keep the process running and print sync status logs after starting them.


### garden sync stop

**Stop any active syncs to the given Deploy action(s).**

Stops one or more active syncs.

Examples:
    # stop syncing to the 'api' Deploy
    garden sync stop api

    # stop all active syncs
    garden sync stop

#### Usage

    garden sync stop [names] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of one or more Deploy(s) (or services if using modules) to sync. You may specify multiple names, separated by spaces. To start all possible syncs, run the command with no arguments.



### garden sync restart

**Restart any active syncs to the given Deploy action(s).**

Restarts one or more active syncs.

Examples:
    # Restart syncing to the 'api' Deploy
    garden sync restart api

    # Restart all active syncs
    garden sync restart

#### Usage

    garden sync restart <names> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | Yes | The name(s) of one or more Deploy(s) (or services if using modules) whose syncs you want to restart. You may specify multiple names, separated by spaces. To restart all possible syncs, specify &#x27;*&#x27; as an argument.



### garden sync status

**Get sync statuses.**

Get the current status of the configured syncs for this project.

Examples:
    # get all sync statuses
    garden sync status

    # get sync statuses for the 'api' Deploy
    garden sync status api

    # output detailed sync statuses in JSON format
    garden sync status -o json

    # output detailed sync statuses in YAML format
    garden sync status -o yaml

#### Usage

    garden sync status [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the Deploy(s) to get the sync status for (skip to get status from all Deploys in the project). You may specify multiple names, separated by space.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--skip-detail` |  | boolean | Skip plugin specific sync details. Only applicable when using the --output&#x3D;json|yaml option. Useful for trimming down the output.


### garden test

**Run all or specified Test actions in the project.**

Runs all or specified Tests defined in the project. Also run builds and other dependencies,
including Deploys if needed.

Examples:

    garden test                     # run all Tests in the project
    garden test my-test             # run the my-test Test action
    garden test --module my-module  # run all Tests in the my-module module
    garden test *integ*             # run all Tests with a name containing 'integ'
    garden test *unit,*lint         # run all Tests ending with either 'unit' or 'lint' in the project
    garden test --force             # force Tests to be re-run, even if they've already run successfully
    garden test -l 3                # run with verbose log level to see the live log output

#### Usage

    garden test [names] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `names` | No | The name(s) of the Test action(s) to test (skip to run all tests in the project). You may specify multiple test names, separated by spaces. Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;).

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--name` |  | array:string | DEPRECATED: This option will be removed in 0.15. Please use a positional argument &quot;&lt;module name&gt;-&lt;test name&gt;&quot; or &quot;*-&lt;test name&gt;&quot; instead of &quot;--name&quot;.
This option can be used to run all tests with the specified name (e.g. unit or integ) in declared in any module.
Note: Since 0.13, using the --name option is equivalent to using the positional argument &quot;*-&lt;test name&gt;&quot;. This means that new tests declared using the new Action kinds will also be executed if their name matches this pattern.
Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;).
  | `--force` |  | boolean | Force re-run of Test, even if a successful result is found in cache.
  | `--force-build` |  | boolean | Force rebuild of any Build dependencies encountered.
  | `--interactive` |  | boolean | Run the specified Test in interactive mode (i.e. to allow attaching to a shell). A single test must be selected, otherwise an error is thrown.
  | `--module` |  | array:string | The name(s) of one or modules to run tests from. If both this and test names are specified, the test names filter the tests found in the specified modules.
  | `--skip` |  | array:string | The name(s) of tests you&#x27;d like to skip. Accepts glob patterns (e.g. integ* would skip both &#x27;integ&#x27; and &#x27;integration&#x27;). Applied after the &#x27;name&#x27; filter.
  | `--skip-dependencies` |  | boolean | Don&#x27;t deploy any Deploys (or services if using modules) or run any Run actions (or tasks if using modules) that the requested tests depend on. This can be useful e.g. when your stack has already been deployed, and you want to run Tests with runtime dependencies without redeploying any Deploy (or service) dependencies that may have changed since you last deployed. Warning: Take great care when using this option in CI, since Garden won&#x27;t ensure that the runtime dependencies of your test suites are up to date when this option is used.

#### Outputs

```yaml
# Set to true if the command execution was aborted.
aborted:

# Set to false if the command execution was unsuccessful.
success:

# A map of all executed Builds (or Builds scheduled/attempted) and information about them.
build:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about
# them. Please do not use this alias, it will be removed in a future release.
builds:
  <Build name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.
deploy:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# [DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy
# status. Please do not use this alias, it will be removed in a future release.
deployments:
  <Deploy name>:
    # When the service was first deployed by the provider.
    createdAt:

    # When the service was first deployed by the provider.
    updatedAt:

    # The mode the action is deployed in.
    mode:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # Set to true if the action was not attempted, e.g. if a dependency failed.
    aborted:

    # The duration of the action's execution in msec, if applicable.
    durationMsec:

    # Whether the action was successfully executed.
    success:

    # An error message, if the action's execution failed.
    error:

    # The version of the task's inputs, before any resolution or execution happens. For action tasks, this will
    # generally be the unresolved version.
    inputVersion:

    # Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For
    # action tasks, this will generally be the unresolved version.
    version:

    actionState:

    # A map of values output from the action's execution.
    outputs:
      <name>:

# A map of all Tests that were executed (or scheduled/attempted) and the Test results.
test:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results.
# Please do not use this alias, it will be removed in a future release.
tests:
  <Test name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# A map of all Runs that were executed (or scheduled/attempted) and the Run results.
run:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

# [DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results.
# Please do not use this alias, it will be removed in a future release.
tasks:
  <Run name>:
    # Whether the module was successfully run.
    success:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:
```

### garden tools

**Access tools included by providers.**

Run a tool defined by a provider in your project, downloading and extracting it if necessary. Run without arguments to get a list of all tools available.

Run with the --get-path flag to just print the path to the binary or library directory (depending on the tool type). If the tool is a non-executable library, this flag is implicit.

When multiple plugins provide a tool with the same name, you can choose a specific plugin/version by specifying <plugin name>.<tool name>, instead of just <tool name>. This is generally advisable when using this command in scripts, to avoid accidental conflicts.

When there are name conflicts and a plugin name is not specified, we first prefer tools defined by configured providers in the current project (if applicable), and then alphabetical by plugin name.

Examples:

    # Run kubectl with <args>.
    garden tools kubectl -- <args>

    # Run the kubectl version defined specifically by the `kubernetes` plugin.
    garden tools kubernetes.kubectl -- <args>

    # Print the path to the kubernetes.kubectl tool to stdout, instead of running it.
    garden tools kubernetes.kubectl --get-path

    # List all available tools.
    garden tools

#### Usage

    garden tools [tool] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `tool` | No | The name of the tool to run.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--get-path` |  | boolean | If specified, we print the path to the binary or library instead of running it.


### garden unlink source

**Unlink a previously linked remote source from its local directory.**

After unlinking a remote source, Garden will go back to reading it from its remote URL instead
of its local directory.

Examples:

    garden unlink source my-source  # unlinks my-source
    garden unlink source --all      # unlinks all sources

#### Usage

    garden unlink source [sources] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `sources` | No | The name(s) of the source(s) to unlink. You may specify multiple sources, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` |  | boolean | Unlink all sources.


### garden unlink action

**Unlink a previously linked remote action from its local directory.**

After unlinking a remote action, Garden will go back to reading the action's source from its remote repository instead of its local directory.

Examples:

    garden unlink action build.my-build  # unlinks Build my-build
    garden unlink action --all           # unlink all actions

#### Usage

    garden unlink action [actions] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `actions` | No | The name(s) of the action(s) to unlink. You may specify multiple actions, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` |  | boolean | Unlink all actions.


### garden unlink module

**Unlink a previously linked remote module from its local directory.**

After unlinking a remote module, Garden will go back to reading the module's source from
its remote URL instead of its local directory.

Examples:

    garden unlink module my-module  # unlinks my-module
    garden unlink module --all      # unlink all modules

#### Usage

    garden unlink module [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to unlink. You may specify multiple modules, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` |  | boolean | Unlink all modules.


### garden up

**Spin up your stack with the dev console and streaming logs.**

Spin up your stack with the dev console and streaming logs.

This is basically an alias for garden dev --cmd 'deploy --logs', but you can add any arguments and flags supported by the deploy command as well.

#### Usage

    garden up 



### garden update-remote sources

**Update remote sources.**

Updates the remote sources declared in the project level `garden.yml` config file.

Examples:

    garden update-remote sources --parallel # update all remote sources in parallel mode
    garden update-remote sources            # update all remote sources
    garden update-remote sources my-source  # update remote source my-source

#### Usage

    garden update-remote sources [sources] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `sources` | No | The name(s) of the remote source(s) to update. You may specify multiple sources, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--parallel` |  | boolean | Allow git updates to happen in parallel. This will automatically reject any Git prompt, such as username / password.

#### Outputs

```yaml
# A list of all configured external project sources.
sources:
  - # The name of the source to import
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden update-remote actions

**Update remote actions.**

Updates remote actions, i.e. actions that have a `source.repository.url` field set in their config that points to a remote repository.

Examples:

    garden update-remote actions --parallel      # update all remote actions in parallel mode
    garden update-remote actions                 # update all remote actions in the project
    garden update-remote action build.my-build   # update remote Build my-build

#### Usage

    garden update-remote actions [actions] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `actions` | No | The name(s) of the remote action(s) to update. You may specify multiple actions, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--parallel` |  | boolean | Allow git updates to happen in parallel. This will automatically reject any Git prompt, such as username / password.

#### Outputs

```yaml
# A list of all external action sources in the project.
sources:
  - # The name of the action.
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden update-remote modules

**Update remote modules.**

Updates remote modules, i.e. modules that have a `repositoryUrl` field
in their `garden.yml` config that points to a remote repository.

Examples:

    garden update-remote modules --parallel # update all remote modules in parallel mode
    garden update-remote modules            # update all remote modules in the project
    garden update-remote modules my-module  # update remote module my-module

#### Usage

    garden update-remote modules [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the remote module(s) to update. You may specify multiple modules, separated by spaces.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--parallel` |  | boolean | Allow git updates to happen in parallel. This will automatically reject any Git prompt, such as username / password.

#### Outputs

```yaml
# A list of all external module sources in the project.
sources:
  - # The name of the module.
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden update-remote all

**Update all remote sources, actions and modules.**

Examples:

    garden update-remote all             # update all remote sources, actions and modules in the project
    garden update-remote all --parallel  # update all remote sources in the project in parallel mode

#### Usage

    garden update-remote all [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--parallel` |  | boolean | Allow git updates to happen in parallel. This will automatically reject any Git prompt, such as username / password.

#### Outputs

```yaml
# A list of all configured external project sources.
projectSources:
  - # The name of the source to import
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:

# A list of all external action sources in the project.
actionSources:
  - # The name of the action.
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:

# A list of all external module sources in the project.
moduleSources:
  - # The name of the module.
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden util fetch-tools

**Pre-fetch plugin tools.**

Pre-fetch all the available tools for the configured providers in the current
project/environment, or all registered providers if the --all parameter is
specified.

Examples:

    garden util fetch-tools        # fetch for just the current project/env
    garden util fetch-tools --all  # fetch for all registered providers

#### Usage

    garden util fetch-tools [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` |  | boolean | Fetch all tools for registered plugins, instead of just ones in the current env/project.


### garden util hide-warning

**Hide a specific warning message.**

Hides the specified warning message. The command and key is generally provided along with displayed warning messages.

#### Usage

    garden util hide-warning <key> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `key` | Yes | The key of the warning to hide (this will be shown along with relevant warning messages).



### garden util mutagen

**Run any Mutagen CLI command in the context of the current project.**

The Mutagen tool is used for various functions in Garden, most notably syncs (formerly "dev mode") to containers. When experiencing issues with synchronization, it may be helpful to use the Mutagen CLI directly to troubleshoot or gather more information.

This command simply runs the Mutagen CLI with environment variables appropriately set to interact with the syncs created in the context of this project. All arguments and flags are passed directly to Mutagen.

Examples:

    garden util mutagen sync list     # list all active syncs
    garden util mutagen sync monitor  # continuously monitor all syncs

#### Usage

    garden util mutagen 



### garden util profile-project

**Renders a high-level summary of actions and modules in your project.**

Useful for diagnosing slow init performance for projects with lots of actions and modules and/or lots of files.

#### Usage

    garden util profile-project 



### garden validate

**Check your garden configuration for errors.**

Throws an error and exits with code 1 if something's not right in your garden config files.

Examples:

    garden validate                              # validate all configs, but don't fully resolve any actions
    garden validate --resolve build.my-image     # same as above, but fully resolve the build.my-image action
    garden validate --resolve deploy.my-service
    garden validate --resolve '*'                # fully resolve all actions
    garden validate --resolve                    # fully resolve all actions

#### Usage

    garden validate [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--resolve` |  | array:string | Fully resolve a specific action, including references to runtime outputs from other actions. Actions should be specified as &#x60;&lt;kind&gt;.&lt;name&gt;&#x60; (e.g. &#x60;deploy.my-service&#x60; or &#x60;build.my-image&#x60;). This option can be specified multiple times to fully resolve multiple actions. Use * to fully resolve all actions. Note that this may result in actions being executed during validation (e.g. if a runtime output is referenced by another action, it will be executed in order to fully resolve the config). In such cases, we recommend not using this option.


### garden version

**Shows the current garden version.**


#### Usage

    garden version 



