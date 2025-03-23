---
order: 10
title: Variables and Templating
---

Garden has a powerful templating engine that allows you to set variables and enable or disable parts of the graph depending on your environment.

## Template string overview

String configuration values in Garden config files can be templated to inject variables, information about the user's environment, references to other actions and more.

The basic syntax for templated strings is `${some.key}`. The key is looked up from the _template context_ available when resolving the string. The available context depends on what is being resolved, i.e. a _project_, _action_, _provider_ etc.

For example, for one action you might want to reference something from another action and expose it as an environment variable:

```yaml
kind: some-action
spec:
  env:
    OTHER_ACTION_VERSION: ${actions.build.some-build.version}
```

You can also inject a template variable into a string. For instance, you might need to include an actions's
version as part of a URI:

```yaml
OTHER_ACTION_ENDPOINT: http://other-module/api/${actions.deploy.some-deploy.version}
```

Note that while this syntax looks similar to template strings in Javascript, we don't allow arbitrary JS expressions. See the next section for the available expression syntax.

### Literals

In addition to referencing variables from template contexts, you can include a variety of _literals_ in template strings:

* _Strings_, including concatenated ones, enclosed with either double or single quotes: `${"foo"}`, `${'bar'}`, `${'bar' + 'foo}`.
* _Numbers_: `${123}`
* _Booleans_: `${true}`, `${false}`
* _Null_: `${null}`
* _Arrays_: `${[1, 2, 3]}`, `${["foo", "bar"]}`, `${[var.someKey, var.someOtherKey]}`, `${concat(["foo", "bar"], ["baz"])}`, `${join(["foo", "bar"], ",")}`

These can be used with [operators](#operators), as [helper function arguments](#helper-functions) and more.

### Operators

You can use a variety of operators in template string expressions:

* Arithmetic: `*`, `/`, `%`, `+`, `-`
* Numeric comparison: `>=`, `<=`, `>`, `<`
* Equality: `==`, `!=`
* Logical: `&&`, `||`, ternary (`<test> ? <value if true> : <value if false>`)
* Unary: `!` (negation), `typeof` (returns the type of the following value as a string, e.g. `"boolean"` or `"number"`)
* Relational: `contains` (to see if an array contains a value, an object contains a key, or a string contains a substring)
* Arrays: `+`
* Strings: `+`

The arithmetic and numeric comparison operators can only be used for numeric literals and keys that resolve to numbers, except the `+` operator which can be used to concatenate two strings or array references. The equality and logical operators work with any term (but be warned that arrays and complex objects aren't currently compared in-depth).

Clauses are evaluated in standard precedence order, but you can also use parentheses to control evaluation order (e.g. `${(1 + 2) * (3 + 4)}` evaluates to 21).

These operators can be very handy, and allow you to tailor your configuration depending on different environments and other contextual variables.

Below are some examples of usage:

The `||` operator allows you to set default values:

```yaml
kind: Deploy
variables:
  log-level: ${local.env.LOG_LEVEL || "info"}
  namespace: ${local.env.CI_BRANCH || local.username || "default"}
```

The `==` and `!=` operators allow you to set boolean flags based on other variables:

```yaml
kind: Deploy
disabled: ${environment.name == 'prod'}
```

```yaml
kind: Build
allowPublish: ${environment.name != 'prod'}
```

Ternary expressions, combined with comparison operators, can be useful when provisioning resources:

```yaml
kind: Deploy
type: container
spec:
  replicas: "${environment.name == 'prod' ? 3 : 1}"
```

The `contains` operator can be used in several ways:

* `${var.some-array contains "some-value"}` checks if the `var.some-array` array includes the string `"some-value"`.
* `${var.some-string contains "some"}` checks if the `var.some-string` string includes the substring `"some"`.
* `${var.some-object contains "some-key"}` checks if the `var.some-object` object includes the key `"some-key"`.

The arithmetic operators can be handy when provisioning resources:

```yaml
kind: Deploy
type: container
spec:
  replicas: ${var.default-replicas * 2}
  cpu:
    max: ${var.default-cpu-max + 2000}
```

And the `+` operator can also be used to concatenate two arrays or strings:

```yaml
apiVersion: garden.io/v1
kind: Project
variables:
  some-values: ["a", "b"]
  other-values: ["c", "d"]
  str1: "foo"
  str2: "bar"
---
kind: Deploy
type: helm
values:
  some-array: ${var.some-values + var.other-values}
  str12: ${var.str1 + var.str2}
```

### Helper functions

You can use a variety of helper functions in template strings, for things like string processing, parsing, conversions etc. You find a [full list in the reference docs](../reference/template-strings/functions.md), but here are a couple of examples:

* `${base64Encode('my value')}` encodes the `'my value'` string as base64.
* `${base64Decode('bXkgdmFsdWU=')}` decodes the given base64 string.
* `${replace(var.someVariable, "_", "-")}` returns the `someVariable` variable with all underscores replaced with dashes.

Check out [the reference](../reference/template-strings/functions.md) to explore all the available functions.

### If/else conditional objects

You can conditionally set values by specifying an object with `$if`, `$then` and (optionally) `$else` keys. This can in many cases be clearer and easier to work with, compared to specifying values within conditional template strings.

Here's an example:

```yaml
kind: Deploy
spec:
  command:
    $if: ${this.mode == "sync"}
    $then: [npm, run, watch]
    $else: [npm, start]
```

This sets `spec.command` to `[npm, run, watch]` when the action is in sync mode, otherwise to `[npm, start]`.

You can also skip the `$else` key to default the conditional to _no value_ (i.e. undefined).

### Multi-line if/else blocks in strings

You can use if/else blocks in strings. These are particularly handy when templating multi-line strings and generated files in [action templates](./config-templates.md).

The syntax is `${if <expression>}<content>[${else}]<alternative content>${endif}`, where `<expression>` is any expression you'd put in a normal template string.

Here's a basic example:

```yaml
variables:
  some-script: |
    #!/bin/sh
    echo "Hello, I'm a bash script!"

    ${if environment.name == "dev"}
    echo "-> debug mode"
    DEBUG=true
    ${else}
    DEBUG=false
    ${endif}
```

You can also nest if-blocks, should you need to.

### Nested lookups and maps

In addition to dot-notation for key lookups, we also support bracketed lookups, e.g. `${some["key"]}` and `${some-array[0]}`.

This style offer nested template resolution, which is quite powerful, because you can use the output of one expression to choose a key in a parent expression.

For example, you can declare a mapping variable for your project, and look up values by another variable such as the current environment name. To illustrate, here's an excerpt from a project config with a mapping variable:

```yaml
apiVersion: garden.io/v1
kind: Project
variables:
  - replicas:
      dev: 1
      prod: 3
```

And here that variable is used in a Deploy:

```yaml
kind: Deploy
type: container
spec:
  replicas: ${var.replicas["${environment.name}"]}
```

When the nested expression is a simple key lookup like above, you can also just use the nested key directly, e.g. `${var.replicas[environment.name]}`.

You can even use one variable to index another variable, e.g. `${var.a[var.b]}`.

### Concatenating lists

Any list/array value supports a special kind of value, which is an object with a single `$concat` key. This allows you to easily concatenate multiple arrays.

Here's an example where we concatenate the same templated value into two arrays of test arguments:

<!---TODO: Change this example once we have Groups-->
```yaml
kind: Module
...
variables:
  commonArgs:
    - npm
    - test
    - -g
tests:
  - name: test-a
    # resolves to [npm, test, -g, suite-a]
    args:
      - $concat: ${var.commonArgs}
      - suite-a
  - name: test-b
    # resolves to [npm, test, -g, suite-b]
    args:
      - $concat: ${var.commonArgs}
      - suite-b
```

### For loops

You can map through a list of values by using the special `$forEach/$return` object.

You specify an object with two keys, `$forEach: <some list or object>` and `$return: <any value>`. You can also optionally add a `$filter: <expression>` key, which if evaluates to `false` for a particular value, it will be omitted.

Template strings in the `$return` and `$filter` fields are resolved with the same template context as what's available when resolving the for-loop, in addition to `${item.value}` which resolves to the list item being processed, and `${item.key}`.

You can loop over lists as well as mapping objects. When looping over lists, `${item.key}` resolves to the index number (starting with 0) of the item in the list. When looping over mapping objects, `${item.key}` is simply the key name of the key value pair.

Here's an example where we kebab-case a list of string values:

```yaml
kind: Run
variables:
  values:
    - some_name
    - AnotherName
    - __YET_ANOTHER_NAME__
spec:
  args:
    $forEach: ${var.values}
    $return: ${kebabCase(item.value)}
```

Here's another example, where we create an object for each value in a list and skip certain values:

```yaml
kind: Deploy
type: container
variables:
  ports:
    - 80
    - 8000
    - 8100
    - 8200
spec:
  ports:
    # loop through the ports list declared above
    $forEach: ${var.ports}
    # only use values higher than 1000
    $filter: ${item.value > 1000}
    # for each port number, create an object with a name and a port key
    $return:
      name: port-${item.key}  # item.key is the array index, starting with 0
      containerPort: ${item.value}
```

And here we loop over a mapping object instead of a list:

```yaml
kind: Deploy
type: container
variables:
  ports:
    http: 8000
    admin: 8100
    debug: 8200
spec:
  ports:
    # loop through the ports map declared above
    $forEach: ${var.ports}
    # for each port number, create an object with a name and a port key
    $return:
      name: ${item.key}
      containerPort: ${item.value}
```

And lastly, here we have an arbitrary object for each value instead of a simple numeric value:

```yaml
kind: Deploy
type: container
variables:
  ports:
    http:
      container: 8000
      service: 80
    admin:
      container: 8100
    debug:
      container: 8200
spec:
  ports:
    # loop through the ports map declared above
    $forEach: ${var.ports}
    # for each port number, create an object with a name and a port key
    $return:
      name: ${item.key}
      # see how we can reference nested keys on item.value
      containerPort: ${item.value.container}
      # resolve to the service key if it's set, otherwise the container key
      servicePort: ${item.value.service || item.value.container}
```

### Merging maps

Any object or mapping field supports a special `$merge` key, which allows you to merge two objects together. This can be used to avoid repeating a set of commonly repeated values.

Here's an example where we share a common set of environment variables for two services:

```yaml
kind: Project
variables:
  - commonEnvVars:
      LOG_LEVEL: info
      SOME_API_KEY: abcdefg
      EXTERNAL_API_URL: http://api.example.com
```

```yaml
kind: Deploy
type: container
name: service-a
spec:
  env:
    $merge: ${var.commonEnvVars}
    OTHER_ENV_VAR: something
    LOG_LEVEL: debug  # <- This overrides the value set in commonEnvVars, because it is below the $merge key
---
kind: Deploy
type: container
name: service-b
services:
  env:
    SOME_API_KEY: default # <- Because this is above the $merge key, the API_KEY from commonEnvVars will override this
    $merge: ${var.commonEnvVars}
```

Notice above that the position of the `$merge` key matters. If the keys being merged overlap between the two objects, the value that's defined later is chosen.

### Optional values

In some cases, you may want to provide configuration values only for certain cases, e.g. only for specific environments. By default, an error is thrown when a template string resolves to an undefined value, but you can explicitly allow that by adding a `?` after the template.

Example:

```yaml
kind: Project
providers:
  - name: kubernetes
    kubeconfig: ${var.kubeconfig}?
```

This is useful when you don't want to provide _any_ value unless one is explicitly set, effectively falling back to whichever the default is for the field in question.

## Project variables

A common use case for templating is to define variables in the project/environment configuration, and to use template strings to propagate values to actions in the project.

You can define them in your project configuration using the [`variables` key](../reference/project-config.md#variables), as well as the [`environment[].variables` key](../reference/project-config.md#environmentsvariables) for environment-specific values.

You might, for example, define project defaults using the `variables` key, and then provide environment-specific overrides in the `environment[].variables` key for each environment. When merging the environment-specific variables and project-wide variables, we use a [JSON Merge Patch](https://tools.ietf.org/html/rfc7396).

The variables can then be referenced via `${var.<key>}` template string keys. For example:

```yaml
kind: Project
variables:
  log-level: info
environments:
  - name: local
    variables:
      log-level: debug
  - name: remote

---

kind: Deploy
spec:
  env:
    LOG_LEVEL: ${var.log-level}   # <- resolves to "debug" for the "local" environment, "info" for the "remote" env
```

Variable values can be any valid JSON/YAML values (strings, numbers, nulls, nested objects, and arrays of any of those). When referencing a nested key, simply use a standard dot delimiter, e.g. `${var.my.nested.key}`.

You can also output objects or arrays from template strings. For example:

```yaml
kind: Project
variables:
  dockerBuildArgs: [--no-cache, --squash]  # (this is just an example, not suggesting you actually do this :)
  envVars:
    LOG_LEVEL: debug
    SOME_OTHER_VAR: something

---

kind: Build
spec:
  buildArgs: ${var.dockerBuildArgs}  # <- resolves to the whole dockerBuildArgs list

---

kind: Deploy
spec:
  env: ${var.envVars}  # <- resolves to the whole envVars object
```

### Variable files (varfiles)

You can also provide variables using "variable files" or _varfiles_. These work mostly like "dotenv" files or envfiles. However, they don't implicitly affect the environment of the Garden process and the configured services, but rather are added on top of the `variables` you define in your project configuration (or action variables defined in the `variables` of your individual action configurations).

This can be very useful when you need to provide secrets and other contextual values to your stack. You could add your varfiles to your `.gitignore` file to keep them out of your repository, or use e.g. [git-crypt](https://github.com/AGWA/git-crypt), [BlackBox](https://github.com/StackExchange/blackbox) or [git-secret](https://github.com/sobolevn/git-secret) to securely store the files in your Git repo.

By default, Garden will look for a `garden.env` file in your project root for project-wide variables, and a `garden.<env-name>.env` file for environment-specific variables. You can override the filename for each as well.

To use a action-level varfile, simply configure the `varfile` field to be the relative path (from action root) to the varfile you want to use for that action. For example:

```yaml
# my-deploy/garden.yml
kind: Deploy
name: my-deploy
# Here, we use per-environment action varfiles as an optional override for variables (these have a higher precedence
# than those in the `variables` field below).
#
varfiles:
  # If a varfile is defined but not found, an error is thrown in order to prevent misconfigurations silently passing.
  - my-service.${environment.name}.yaml
  # To add an optional varfile, specify an object with the following properties:
  # - path: The relative path to the varfile from the action root directory.
  # - optional: A boolean value indicating whether the varfile is optional or required.
  - path: my-service-2.${environment.name}.yaml
    optional: true
variables:
  # This overrides the project-level hostname variable
  hostname: my-service.${var.hostname}
  # You can specify maps or lists as variables
  envVars:
    LOG_LEVEL: debug
    DATABASE_PASSWORD: ${var.database-password}
spec:
  ingresses:
    - path: /
      port: http
      # This resolves to the hostname variable set above, not the project-level hostname variable
      hostname: ${var.hostname}
  # Referencing the above envVar action variable
  env: ${var.envVars}
```

Action varfiles must be located inside the action root directory. That is, they must be in the same directory as the action configuration, or in a subdirectory of that directory.

Note that variables defined in action varfiles override variables defined in project-level variables and varfiles (see the section on variable precedence order below).

The format of the files is determined by the configured file extension:

* `.env` - Standard "dotenv" format, as supported by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.yaml`/`.yml` - YAML. Must be a single document in the file, and must be a key/value map (but keys may contain any value types).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

{% hint style="info" %}
The default varfile format will change to YAML in Garden v0.14, since YAML allows for definition of nested objects and arrays.

In the meantime, to use YAML or JSON files, you must explicitly set the varfile name(s) in your project configuration, via the [`varfile`](../reference/project-config.md#varfile) and/or [`environments[].varfile`](../reference/project-config.md#environmentsvarfile) fields.
{% endhint %}

You can also set variables on the command line, with `--var` flags. To override a nested variable, you can use dot notation. Note that while this is handy for ad-hoc invocations, we don't generally recommend relying on this for normal operations, since you lose a bit of visibility within your configuration. But here's one practical example:

```sh
# Override three specific variables value and run a task.
# Use dot notation to override nested variables
garden run my-run --var my-run-arg=foo,some-numeric-var=123,my-nested-vars.var1=bar
```

Multiple variables are separated with a comma, and each part is parsed using [dotenv](https://github.com/motdotla/dotenv#rules) syntax.

## Variable precedence order

The order of precedence is as follows (from highest to lowest):

1. Individual variables set with `--var` CLI flags.
2. The module/action-level varfile (if configured).
3. Module/action variables set in `module.variables`.
4. The environment-specific varfile (defaults to `garden.<env-name>.env`).
5. The environment-specific variables set in `environment[].variables`.
6. Configured project-wide varfile (defaults to `garden.env`).
7. The project-wide `variables` field.

{% hint style="warning" %}
Note that [Module variables](https://github.com/garden-io/garden/blob/0.12/docs/features/variables-and-templating.md#module-variables) always take precedence over any of the above, in the context of the module being resolved.
{% endhint %}

When you specify variables in multiple places, we merge the different objects and files using a [JSON Merge Patch](https://tools.ietf.org/html/rfc7396).

Here's an example, where we have some project variables defined in our project config, and environment-specific values—including secret data—in varfiles:

```yaml
# garden.yml
apiVersion: garden.io/v1
kind: Project
...
variables:
  LOG_LEVEL: debug
environments:
  - name: local
    ...
  - name: remote
    ...
```

```plain
# garden.remote.env
log-level=info
database-password=fuin23liu54at90hiongl3g
```

```yaml
# my-service/garden.yml
kind: Deploy
spec:
  env:
    LOG_LEVEL: ${var.log-level}
    DATABASE_PASSWORD: ${var.database-password}
```

## Provider outputs

Providers often expose useful variables that other provider configs and actions can reference, under `${providers.<name>.outputs.<key>}`. Each provider exposes different outputs, and some providers have dynamic output keys depending on their configuration.

For example, you may want to reference the app namespace from the [Kubernetes provider](../reference/providers/kubernetes.md) in module configs:

```yaml
kind: Deploy
type: helm
spec:
  values:
    namespace: `${providers.kubernetes.outputs.app-namespace}`
```

Another good example is referencing outputs from Terraform stacks, via the [Terraform provider](../garden-for/terraform/configure-provider.md):

```yaml
kind: Deploy
spec:
  env:
    DATABASE_URL: `${providers.terraform.outputs.database_url}` # <- resolves the "database_url" stack output
```

Check out the individual [provider reference](../reference/providers/README.md) guides for details on what outputs each provider exposes.

## Action outputs

Actions often output useful information, that other actions can reference (provider and project configs cannot reference action outputs). Every action also exposes certain keys, like the action version.

For example, you may want to reference the image name and version of a [container Build](../reference/module-types/container.md):

```yaml
kind: Deploy
type: helm
spec:
  values:
    # Resolves to the image name of the module, with the module version as the tag (e.g. "my-image:abcdef12345")
    image: `${actions.my-build.outputs.deployment-image-id}`
```

Check out the individual [action type reference](../reference/action-types/README.md) guides for details on what outputs each action type exposes.

## Action Runtime outputs

Some actions (namely Runs) expose template keys prefixed with `actions.<kind>.<name>.outputs.` which some special semantics. They are used to expose _runtime outputs_ from actions and therefore are resolved later than other template strings. _This means that you cannot use them for some fields, such as most identifiers, because those need to be resolved before validating the configuration._

That caveat aside, they can be very handy for passing information between actions. For example, you can pass log outputs from one task to another:

```yaml
kind: Run
type: exec
name: prep-run
spec:
  command: [echo, "my run output"]
---
kind: Deploy
name: my-deploy
dependencies: [run.prep-run]
spec:
  env:
    PREP_TASK_OUTPUT: ${actions.run.prep-run.outputs.log}  # <- resolves to "my task output"
```

Here the output from `prep-run` is copied to an environment variable for `my-deploy`. _Note that you currently need to explicitly declare `prep-run` as a dependency for this to work._

For a practical use case, you might for example make a Run that provisions some infrastructure or prepares some data, and then passes information about it to Deploy.

Different action types expose different outputs. Please refer to the [action type reference docs](../reference/action-types/README.md) for details.

## Next steps

For a full reference of the keys available in template strings in different contexts, please look at the [Template Strings Reference](../reference/template-strings/README.md), as well as individual [providers](../reference/providers/README.md) for provider outputs, and [action types](../reference/action-types/README.md) for action and runtime output keys.

Also take a look at our [Guides section](../guides/README.md) for various specific uses of Garden.
