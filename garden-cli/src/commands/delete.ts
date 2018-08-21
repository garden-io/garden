/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import {
  DeleteConfigResult,
  EnvironmentStatusMap,
} from "../types/plugin/outputs"
import {
  Command,
  CommandResult,
  CommandParams,
  ParameterValues,
  StringParameter,
  StringsParameter,
} from "./base"
import { NotFoundError } from "../exceptions"
import dedent = require("dedent")
import { ServiceStatus } from "../types/service"

export class DeleteCommand extends Command {
  name = "delete"
  alias = "del"
  help = "Delete configuration or objects."

  subCommands = [
    DeleteConfigCommand,
    DeleteEnvironmentCommand,
    DeleteServiceCommand,
  ]

  async action() { return {} }
}

export const deleteConfigArgs = {
  key: new StringParameter({
    help: "The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).",
    required: true,
  }),
}

export type DeleteConfigArgs = ParameterValues<typeof deleteConfigArgs>

// TODO: add --all option to remove all configs

export class DeleteConfigCommand extends Command<typeof deleteConfigArgs> {
  name = "config"
  help = "Delete a configuration variable from the environment."

  description = dedent`
    Returns with an error if the provided key could not be found in the configuration.

    Examples:

        garden delete config somekey
        garden del config some.nested.key
  `

  arguments = deleteConfigArgs

  async action({ ctx, args }: CommandParams<DeleteConfigArgs>): Promise<CommandResult<DeleteConfigResult>> {
    const key = args.key.split(".")
    const result = await ctx.deleteConfig({ key })

    if (result.found) {
      ctx.log.info(`Deleted config key ${args.key}`)
    } else {
      throw new NotFoundError(`Could not find config key ${args.key}`, { key })
    }

    return { result }
  }
}

export class DeleteEnvironmentCommand extends Command {
  name = "environment"
  alias = "env"
  help = "Deletes a running environment."

  description = dedent`
    This will trigger providers to clear up any deployments in a Garden environment and reset it.
    When you then run \`garden configure env\` or any deployment command, the environment will be reconfigured.

    This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
    resources.
  `

  async action({ ctx }: CommandParams): Promise<CommandResult<EnvironmentStatusMap>> {
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "skull_and_crossbones", command: `Deleting ${name} environment` })

    const result = await ctx.destroyEnvironment({})

    ctx.log.finish()

    return { result }
  }
}

export const deleteServiceArgs = {
  service: new StringsParameter({
    help: "The name of the service(s) to delete. Use comma as separator to specify multiple services.",
    required: true,
  }),
}
export type DeleteServiceArgs = ParameterValues<typeof deleteServiceArgs>

export class DeleteServiceCommand extends Command {
  name = "service"
  help = "Deletes a running service."
  arguments = deleteServiceArgs

  description = dedent`
    Deletes (i.e. un-deploys) the specified services. Note that this command does not take into account any
    services depending on the deleted service, and might therefore leave the project in an unstable state.
    Running \`garden deploy\` will re-deploy any missing services.

    Examples:

        garden delete service my-service # deletes my-service
  `

  async action({ ctx, args }: CommandParams<DeleteServiceArgs>): Promise<CommandResult> {
    const services = await ctx.getServices(args.service)

    if (services.length === 0) {
      ctx.log.warn({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    ctx.log.header({ emoji: "skull_and_crossbones", command: `Delete service` })

    const result: { [key: string]: ServiceStatus } = {}

    await Bluebird.map(services, async service => {
      result[service.name] = await ctx.deleteService({ serviceName: service.name })
    })

    ctx.log.finish()
    return { result }
  }
}
