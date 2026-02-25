/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { keyBy, mapValues, flatten } from "lodash-es"
import { parseCliArgs, prepareMinimistOpts } from "../cli/helpers.js"
import type { Parameter, ParameterObject } from "../cli/params.js"
import { BooleanParameter, globalOptions, IntegerParameter, StringParameter } from "../cli/params.js"
import { loadConfigResources } from "../config/base.js"
import type { CommandResource, CustomCommandOption } from "../config/command.js"
import { customCommandExecSchema, customCommandGardenCommandSchema, customCommandSchema } from "../config/command.js"
import { joi } from "../config/common.js"
import { CustomCommandContext, CustomCommandStepContext } from "../config/template-contexts/custom-command.js"
import type { CustomCommandContextParams } from "../config/template-contexts/custom-command.js"
import { validateWithPath } from "../config/validation.js"
import type { GardenError } from "../exceptions.js"
import { ConfigurationError, RuntimeError, InternalError, toGardenError } from "../exceptions.js"
import { listDirectory, isConfigFilename } from "../util/fs.js"
import type { CommandParams, CommandResult, PrintHeaderParams } from "./base.js"
import { Command } from "./base.js"
import { customMinimist } from "../lib/minimist.js"
import { removeSlice } from "../util/util.js"
import { join } from "path"
import { getBuiltinCommands } from "./commands.js"
import type { Log } from "../logger/log-entry.js"
import { getTracePropagationEnvVars } from "../util/open-telemetry/propagation.js"
import { styles } from "../logger/styles.js"
import { deepEvaluate } from "../template/evaluate.js"
import { VariablesContext } from "../config/template-contexts/variables.js"
import { EnvironmentContext } from "../config/template-contexts/base.js"
import type { Garden } from "../garden.js"
import { isPlainObject } from "../util/objects.js"
import { scanTemplateReferences, resolveTemplateNeeds } from "../template/lazy-resolve.js"
import { OutputConfigContext } from "../config/template-contexts/module.js"
import { executeSteps, getStepSeparatorBar } from "./helpers/steps.js"
import type { StepSpec, StepResult } from "./helpers/steps.js"

function convertArgSpec(spec: CustomCommandOption) {
  const params = {
    name: spec.name,
    help: spec.description,
    required: spec.required,
    spread: true,
  }

  if (spec.type === "string") {
    return new StringParameter(params)
  } else if (spec.type === "integer") {
    return new IntegerParameter(params)
  } else if (spec.type === "boolean") {
    return new BooleanParameter(params)
  } else {
    throw new ConfigurationError({ message: `Unexpected parameter type '${spec.type}'` })
  }
}

interface CustomCommandResult {
  exec?: {
    startedAt: Date
    completedAt: Date
    command: string[]
    exitCode: number
  }
  gardenCommand?: {
    startedAt: Date
    completedAt: Date
    command: string[]
    result: unknown
    errors: (Error | GardenError)[]
  }
  steps?: Record<string, StepResult>
}

export class CustomCommandWrapper extends Command {
  // These are overridden in the constructor
  name = "<custom>"
  help = ""

  override isCustom = true
  override streamLogEntriesV2 = true
  override allowUndefinedArguments = true

  constructor(public spec: CommandResource) {
    super(spec)
    this.name = spec.name
    this.help = spec.description?.short
    this.description = spec.description?.long

    // Convert argument specs, so they'll be validated
    this.arguments = spec.args ? mapValues(keyBy(spec.args, "name"), convertArgSpec) : {}
    this.options = mapValues(keyBy(spec.opts, "name"), convertArgSpec)
  }

  override printHeader({ log }: PrintHeaderParams) {
    log.info(styles.highlight(this.name))
  }

  async action({
    garden,
    cli,
    log,
    args,
    opts,
  }: CommandParams<ParameterObject, ParameterObject>): Promise<CommandResult<CustomCommandResult>> {
    // Prepare args/opts for the template context.
    // Prepare the ${args.$rest} variable
    // Note: The fork of minimist is a slightly unfortunate hack to be able to extract all unknown args and flags.
    const parsed = customMinimist(
      args.$all || [],
      prepareMinimistOpts({
        options: this.options || {},
        cli: true,
      })
    )
    // Strip the command name and any specified arguments off the $rest variable
    const rest = removeSlice(parsed._unknown, this.getPath()).slice(Object.keys(this.arguments || {}).length)

    // Collect the raw templateable fields to scan for references
    const templateableFields = {
      exec: this.spec.exec,
      gardenCommand: this.spec.gardenCommand,
      steps: this.spec.steps,
      variables: this.spec.variables,
    }

    // Scan for template references to determine if we need lazy resolution
    const expandedContextParams = await this.resolveExpandedContext(garden, log, templateableFields)

    // Build base context params
    const baseContextParams: CustomCommandContextParams = {
      ...garden,
      args,
      opts,
      rest,
      variables: garden.variables,
      ...expandedContextParams,
    }

    // Validate that variables is a map (it was deferred during loading to allow template strings)
    if (this.spec.variables !== undefined && this.spec.variables !== null && !isPlainObject(this.spec.variables)) {
      throw new ConfigurationError({
        message: `The \`variables\` field in custom Command '${this.name}' must be a map of key/value pairs, got ${typeof this.spec.variables}`,
      })
    }

    // Render the command variables
    const variableContext = new CustomCommandContext(baseContextParams)

    // Make a new template context with the resolved variables
    const commandContextParams: CustomCommandContextParams = {
      ...baseContextParams,
      variables: VariablesContext.forCustomCommand(garden, this.spec, variableContext),
    }

    const commandContext = new CustomCommandContext(commandContextParams)

    const result: CustomCommandResult = {}
    const errors: GardenError[] = []

    // Run steps if specified
    if (this.spec.steps && this.spec.steps.length > 0) {
      const steps: StepSpec[] = this.spec.steps
      const stepsResult = await executeSteps({
        steps,
        garden,
        cli,
        log,
        inheritedOpts: opts,
        createStepContext: ({ stepName, allStepNames, resolvedSteps }) => {
          return new CustomCommandStepContext({
            ...commandContextParams,
            allStepNames,
            resolvedSteps,
            stepName,
          })
        },
      })

      result.steps = stepsResult.steps
      return { result, errors }
    }

    // Legacy: run exec command
    if (this.spec.exec) {
      const startedAt = new Date()

      const exec = validateWithPath<CommandResource["exec"]>({
        config: deepEvaluate(this.spec.exec, {
          context: commandContext,
          opts: {},
        }),
        schema: customCommandExecSchema(),
        path: this.spec.internal.basePath,
        projectRoot: garden.projectRoot,
        configType: `exec field in custom Command '${this.name}'`,
        source: undefined,
      })!

      const command = exec.command
      log.info("\n" + getStepSeparatorBar())
      log.debug(`Running exec command: ${command.join(" ")}`)

      const res = await execa(command[0], command.slice(1), {
        stdio: "inherit",
        buffer: true,
        env: {
          ...process.env,
          ...(exec.env || {}),
          ...getTracePropagationEnvVars(),
        },
        cwd: garden.projectRoot,
        reject: false,
      })
      const completedAt = new Date()

      if (res.exitCode !== 0) {
        return {
          exitCode: res.exitCode,
          errors: [
            new RuntimeError({
              message: `Command "${command.join(" ")}" exited with code ${res.exitCode}`,
            }),
          ],
        }
      }

      result.exec = {
        command,
        startedAt,
        completedAt,
        exitCode: res.exitCode,
      }
    }

    // Legacy: run Garden command
    if (this.spec.gardenCommand) {
      const startedAt = new Date()

      let gardenCommand = validateWithPath<CommandResource["gardenCommand"]>({
        config: deepEvaluate(this.spec.gardenCommand, {
          context: commandContext,
          opts: {},
        }),
        schema: customCommandGardenCommandSchema(),
        path: this.spec.internal.basePath,
        projectRoot: garden.projectRoot,
        configType: `gardenCommand field in custom Command '${this.name}'`,
        source: undefined,
      })!

      log.info("\n" + getStepSeparatorBar())
      log.debug(`Running Garden command: ${gardenCommand.join(" ")}`)

      if (!cli) {
        throw new InternalError({ message: `Missing cli argument in custom command wrapper.` })
      }

      // Pass explicitly set global opts with the command, if they're not set in the command itself.
      const parsedCommand = parseCliArgs({ stringArgs: gardenCommand, command: this, cli: false })

      const globalFlags = Object.entries(opts)
        .filter(([flag, value]) => {
          const opt = <Parameter<any>>globalOptions[flag]
          if (opt) {
            if (!parsedCommand[flag] && value !== opt.getDefaultValue(true)) {
              return true
            }
          }
          return false
        })
        .flatMap(([flag, value]) => ["--" + flag, value + ""])

      gardenCommand = [...globalFlags, ...gardenCommand]

      const res = await cli.run({
        args: gardenCommand,
        cwd: garden.projectRoot,
      })

      if (res.consoleOutput) {
        if (res.code === 0) {
          log.info(res.consoleOutput)
        } else {
          log.error(res.consoleOutput)
        }
      }

      const completedAt = new Date()

      errors.push(...res.errors.map((e) => toGardenError(e)))

      result.gardenCommand = {
        startedAt,
        completedAt,
        command: gardenCommand,
        result: res.result,
        errors: res.errors,
      }
    }

    return { result, errors }
  }

  /**
   * Scans template references in the command's templateable fields to determine if we need
   * to lazily resolve providers, modules, or actions. Returns expanded context params.
   */
  private async resolveExpandedContext(
    garden: Garden,
    log: Log,
    templateableFields: Pick<CommandResource, "exec" | "gardenCommand" | "steps" | "variables">
  ): Promise<Partial<CustomCommandContextParams>> {
    // Build a dummy context that has the richer fields, so the scanner can detect references to them
    const dummyContext = new OutputConfigContext({
      garden,
      resolvedProviders: {},
      variables: garden.variables,
      modules: [],
    })

    const needs = scanTemplateReferences(templateableFields, dummyContext)

    if (!needs.hasReferences) {
      return {}
    }

    const resolved = await resolveTemplateNeeds(garden, log, needs)

    const fullEnvName = garden.namespace ? `${garden.namespace}.${garden.environmentName}` : garden.environmentName

    return {
      environment: new EnvironmentContext(garden.environmentName, fullEnvName, garden.namespace),
      resolvedProviders: resolved.providers,
      modules: resolved.modules,
      executedActions: resolved.executedActions,
      graphResults: resolved.results,
      log,
    }
  }
}

export async function getCustomCommands(log: Log, projectRoot: string) {
  // Look for Command resources in the project root directory
  const rootFiles = await listDirectory(projectRoot, { recursive: false })
  const paths = rootFiles.filter(isConfigFilename).map((p) => join(projectRoot, p))

  const resources = flatten(await Promise.all(paths.map((path) => loadConfigResources(log, projectRoot, path))))

  const builtinNames = getBuiltinCommands().flatMap((c) => c.getPaths().map((p) => p.join(" ")))

  // Filter and validate the resources
  const commandResources = <CommandResource[]>resources
    .filter((r) => {
      if (r.kind !== "Command") {
        return false
      }

      if (builtinNames.includes(r.name)) {
        // eslint-disable-next-line no-console
        console.log(
          styles.warning(
            `Ignoring custom command ${r.name} because it conflicts with a built-in command with the same name`
          )
        )
        return false
      }

      return true
    })
    .map((config) =>
      validateWithPath({
        config,
        schema: customCommandSchema().keys({
          // Allowing any values here because they're fully resolved later
          exec: joi.any(),
          gardenCommand: joi.any(),
          steps: joi.any(),
          variables: joi.any(),
        }),
        path: (<CommandResource>config).internal.basePath,
        projectRoot,
        configType: `custom Command '${config.name}'`,
        source: { yamlDoc: (<CommandResource>config).internal.yamlDoc, path: [] },
      })
    )

  return commandResources.map((spec) => new CustomCommandWrapper(spec))
}
