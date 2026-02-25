---
order: 70
title: Custom Commands
---

As part of a Garden project, you can define _custom commands_. You can think of these like Makefile targets, npm package scripts etc., except you have the full power of Garden's templating syntax to work with, and can easily declare the exact arguments and options the command accepts. The custom commands come up when you run `garden help`, which helps make your project easier to use and more self-documenting.

You'll find more examples and details below, but here's a simple example to illustrate the idea:

```yaml
kind: Command
name: api-dev
description:
  short: Start garden with preconfigured options for API development
steps:
  - name: update-submodules
    exec:
      command:
        - sh
        - -c
        - git submodule update --recursive --remote
  - name: deploy
    gardenCommand:
      - deploy
      - --sync
      - api,worker
      - --log-level
      - debug
      - $concat: ${args.$all}
```

Here we imagine a basic day-to-day workflow for a certain group of developers. The user simply runs `garden api-dev`. The first step updates the submodules in the repo, and then we start `garden deploy` with some parameters that we tend to use or prefer.

Of course this is just an example, but no doubt you can imagine some commands, parameters etc. that you use a lot and which would be nice to codify for you and your team. And this example only uses a fraction of what's possible! Read on for more and see what ideas come up.

## Limitations

Before diving in, there are a few constraints and caveats to be aware of when defining your custom commands:

* For performance reasons, we currently only pick custom commands from the project root folder. They can still be in any `*.garden.yml` file in that directory, much like other configs, but we deliberately avoid scanning the entire project structure for commands. By extension, commands cannot be defined in remote sources at this time.

* Commands cannot have the same name as other Garden commands. This is by design, to avoid any potential confusion for users.

* Only the `exec`, `gardenCommand`, `steps`, and `variables` fields can be templated. Other fields need to be statically defined.

We may later lift some of these limitations. Please post a [GitHub issue](https://github.com/garden-io/garden/issues) if any of the above is getting in your way!

## Overview

Each command has to define a `name`, which must be a valid identifier (following the same rules as action names etc.). A short description must also be provided with `description.short`, and you can also provide a longer description on `description.long` which is shown when you run the command with `--help`. For example:

```yaml
kind: Command
name: api-dev
description:
  short: Short text to show when users run garden help
  long: |
    Some arbitrarily long paragraph that gets into more
    detail and is shown then this command is run with
    the --help flag.
...
```

Then, you must define `steps`, or alternatively `exec` and/or `gardenCommand` for simpler commands.

### Steps

The `steps` field lets you define a sequence of steps to run, much like Workflow steps. Each step must specify exactly one of `gardenCommand`, `exec`, or `script`:

- **`gardenCommand`**: Runs a Garden command with the given arguments.
- **`exec`**: Runs an external command. Specify `exec.command` and optionally `exec.env`.
- **`script`**: Runs a bash script inline.

Steps run sequentially. If a step fails, subsequent steps are skipped (unless they have `when: onError` or `when: always`). Each step can have a `name` for referencing its outputs in later steps.

### Legacy: exec and gardenCommand

For simple commands, you can use `exec` and/or `gardenCommand` at the top level. If you specify both, `exec` runs before `gardenCommand`. These fields still work as before, but `steps` is recommended for new commands.

## Referencing outputs between steps

Steps can reference the outputs and logs of previous steps using template strings. Give each step a `name`, then use `${steps.<name>.outputs.*}` or `${steps.<name>.log}` in subsequent steps.

Script steps always produce `stdout`, `stderr`, and `exitCode` outputs. Garden command steps return the command's result object as outputs.

Here's an example that chains steps together:

```yaml
kind: Command
name: preflight
description:
  short: Run preflight checks and deploy if everything passes
steps:
  - name: check-env
    script: |
      if [ -z "$CI" ]; then
        echo "local"
      else
        echo "ci"
      fi
  - name: lint
    exec:
      command: ["npm", "run", "lint"]
  - name: deploy
    gardenCommand:
      - deploy
      - --var
      - environment=${steps.check-env.outputs.stdout}
  - name: notify
    script: echo "Deployed in ${steps.check-env.outputs.stdout} mode"
```

In this example, the `check-env` step detects the environment, `lint` runs a lint check, `deploy` references the detected environment from the first step, and `notify` uses it again to print a message.

### Error handling

Steps support the same error handling options as Workflow steps:

- **`continueOnError`**: Set to `true` to continue even if the step fails.
- **`when`**: Control when the step runs: `onSuccess` (default), `onError`, `always`, or `never`.
- **`skip`**: Set to `true` (or a template expression) to skip the step entirely.

```yaml
kind: Command
name: safe-deploy
description:
  short: Deploy with rollback on failure
steps:
  - name: deploy
    gardenCommand: ["deploy"]
  - name: rollback
    when: onError
    script: echo "Deploy failed, rolling back..."
  - name: cleanup
    when: always
    script: echo "Cleaning up temporary files..."
```

## Templating

The `exec`, `gardenCommand`, `steps`, and `variables` fields can be templated with many of the fields available for project and environment configuration. See [the reference](../reference/template-strings/custom-commands.md) for all the fields available.

When your templates reference providers, actions, or modules (e.g. `${actions.deploy.my-service.outputs.*}` or `${providers.kubernetes.outputs.*}`), Garden lazily resolves only what's needed. This means simple commands that don't reference these remain fast, while commands that do can access the full range of runtime data.

Of special note are the `${args.*}` and `${opts.*}` variables. You can [see below](#defining-arguments-and-option-flags) how to explicitly define both positional arguments and option flags, but you can also use the following predefined variables:

* `${args.$all}` is a list of every argument and flag passed to the command (only subtracting the name of the custom command itself). This includes all normal global Garden option flags, as well as the ones you explicitly specify.

* `${args.$rest}` is a list of every positional argument and option that isn't explicitly defined in the custom command, including all global Garden flags.

* `${args["--"]}` is a list of everything placed after `--` in the command line. For example, if you run `garden my-command -- foo --bar`, this variable will be an array containing `"foo"` and `"--bar"`.

You can also reference any provided option flag under `${opts.*}`, even those that are not explicitly defined. Unspecified options won't be validated, but are still parsed and made available for templating.

For example, if you just want to pass all arguments (beyond global options and the command name itself) to a shell script, you can do something like this:

```yaml
kind: Command
name: my-script
description:
  short: Run that script we keep using
steps:
  - script: |
      echo "I'm a super important script, here we go!"
      echo "We're in the ${project.name} project and you are ${local.username}, in case you forgot..."
      ./scripts/foo.sh ${join(args.$rest, ' ')}
```

Here we use the `join` helper function to convert all extra arguments to a space separated string, and pass that to the imagined `foo.sh` script. Pretty much like using `"$@"` in a bash script. We also reference a couple of other common template variables (in this admittedly contrived example...).

## Defining arguments and option flags

You can explicitly define positional arguments and options that are expected or required for your command, using the `args` and `opts` fields. These are validated and parsed before running the command, and are also shown in the help text when running the command with `--help`. For example:

```yaml
kind: Command
name: wrapped
description:
  short: Execute a Run action with arguments and option flags
args:
  - name: action-name
    description: The name of the Run action
    required: true
opts:
  - name: db
    description: Override the database hostname
    type: string
steps:
  - gardenCommand:
      - run
      - ${args.action-name}
      - --var
      - dbHostname=${opts.db || "db"}
```

Here we've made a wrapper command for executing `Run` actions in your project. We require one positional argument for the name of the action to run. Then we define an option for overriding a project variable. For the example, we imagine there's a project variable that's templated into the `Run` actions that controls the hostname of a database they need to connect to. The last lines in the example override the variable and default to `"db"` if the option flag isn't set. To run this command, you could run e.g. `garden wrapped my-action --db test`, which would run `my-action` with the `dbHostname` variable set to `test`.

You might want to augment this example to further accept any additional arguments and append to the Garden command. To do that, you could add the following:

```yaml
...
steps:
  - gardenCommand:
      - run
      - ${args.action-name}
      - --var
      - dbHostname=${opts.db || "db"}
      - $concat: ${args.$rest}  # <- pass any additional parameters through to the command without validation
```

Now you could, for example, run `garden wrapped my-action --db test --force` and the additional `--force` parameter gets passed to the underlying Garden command.

As you can see, you can do a whole lot here! Read on for more examples.

## Using variables

You can specify a `variables` field, and reference those in the `exec`, `gardenCommand`, and `steps` fields using `${var.*}`, similar to action variables. Note that _project variables_ are not available, since the Garden project is not resolved ahead of resolving the custom command.
