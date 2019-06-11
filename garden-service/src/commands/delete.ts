/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
  StringsParameter,
} from "./base"
import { NotFoundError } from "../exceptions"
import dedent = require("dedent")
import { ServiceStatus, getServiceRuntimeContext } from "../types/service"
import { printHeader } from "../logger/util"
import { DeleteSecretResult } from "../types/plugin/provider/deleteSecret"
import { EnvironmentStatusMap } from "../types/plugin/provider/getEnvironmentStatus"

export class DeleteCommand extends Command {
  name = "delete"
  alias = "del"
  help = "Delete configuration or objects."

  subCommands = [
    DeleteSecretCommand,
    DeleteEnvironmentCommand,
    DeleteServiceCommand,
  ]

  async action() { return {} }
}

const deleteSecretArgs = {
  provider: new StringParameter({
    help: "The name of the provider to remove the secret from.",
    required: true,
  }),
  key: new StringParameter({
    help: "The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).",
    required: true,
  }),
}

type DeleteSecretArgs = typeof deleteSecretArgs

export class DeleteSecretCommand extends Command<typeof deleteSecretArgs> {
  name = "secret"
  help = "Delete a secret from the environment."

  description = dedent`
    Returns with an error if the provided key could not be found by the provider.

    Examples:

        garden delete secret kubernetes somekey
        garden del secret local-kubernetes some-other-key
  `

  arguments = deleteSecretArgs

  async action(
    { garden, log, args }: CommandParams<DeleteSecretArgs>,
  ): Promise<CommandResult<DeleteSecretResult>> {
    const key = args.key!
    const actions = await garden.getActionHelper()
    const result = await actions.deleteSecret({ log, pluginName: args.provider!, key })

    if (result.found) {
      log.info(`Deleted config key ${args.key}`)
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
    When you then run \`garden init\`, the environment will be reconfigured.

    This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
    resources.
  `

  async action({ garden, log, headerLog }: CommandParams): Promise<CommandResult<EnvironmentStatusMap>> {
    printHeader(headerLog, `Deleting ${garden.environmentName} environment`, "skull_and_crossbones")

    const actions = await garden.getActionHelper()
    const result = await actions.cleanupEnvironment({ log })

    return { result }
  }
}

const deleteServiceArgs = {
  services: new StringsParameter({
    help: "The name(s) of the service(s) to delete. Use comma as a separator to specify multiple services.",
    required: true,
  }),
}
type DeleteServiceArgs = typeof deleteServiceArgs

export class DeleteServiceCommand extends Command {
  name = "service"
  alias = "services"
  help = "Deletes running services."
  arguments = deleteServiceArgs

  description = dedent`
    Deletes (i.e. un-deploys) the specified services. Note that this command does not take into account any
    services depending on the deleted service, and might therefore leave the project in an unstable state.
    Running \`garden deploy\` will re-deploy any missing services.

    Examples:

        garden delete service my-service # deletes my-service
  `

  async action({ garden, log, headerLog, args }: CommandParams<DeleteServiceArgs>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph()
    const services = await graph.getServices(args.services)

    if (services.length === 0) {
      log.warn({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    printHeader(headerLog, "Delete service", "skull_and_crossbones")

    const result: { [key: string]: ServiceStatus } = {}

    const actions = await garden.getActionHelper()

    await Bluebird.map(services, async service => {
      const runtimeContext = await getServiceRuntimeContext(garden, graph, service)
      result[service.name] = await actions.deleteService({ log, service, runtimeContext })
    })

    return { result }
  }
}
