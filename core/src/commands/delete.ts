/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, CommandGroup } from "./base"
import { NotFoundError } from "../exceptions"
import dedent from "dedent"
import { ServiceStatusMap, serviceStatusSchema } from "../types/service"
import { printHeader } from "../logger/util"
import { DeleteSecretResult } from "../types/plugin/provider/deleteSecret"
import { EnvironmentStatusMap } from "../types/plugin/provider/getEnvironmentStatus"
import { DeleteServiceTask, deletedServiceStatuses } from "../tasks/delete-service"
import { joi, joiIdentifierMap } from "../config/common"
import { environmentStatusSchema } from "../config/status"
import { StringParameter, StringsParameter } from "../cli/params"
import { emitStackGraphEvent } from "./helpers"

export class DeleteCommand extends CommandGroup {
  name = "delete"
  alias = "del"
  help = "Delete configuration or objects."

  subCommands = [DeleteSecretCommand, DeleteEnvironmentCommand, DeleteServiceCommand]
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
  protected = true

  description = dedent`
    Returns with an error if the provided key could not be found by the provider.

    Examples:

        garden delete secret kubernetes somekey
        garden del secret local-kubernetes some-other-key
  `

  arguments = deleteSecretArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Delete secrete", "skull_and_crossbones")
  }

  async action({ garden, log, args }: CommandParams<DeleteSecretArgs>): Promise<CommandResult<DeleteSecretResult>> {
    const key = args.key!
    const actions = await garden.getActionRouter()
    const result = await actions.deleteSecret({ log, pluginName: args.provider!, key })

    if (result.found) {
      log.info(`Deleted config key ${args.key}`)
    } else {
      throw new NotFoundError(`Could not find config key ${args.key}`, { key })
    }

    return { result }
  }
}

interface DeleteEnvironmentResult {
  providerStatuses: EnvironmentStatusMap
  serviceStatuses: ServiceStatusMap
}

export class DeleteEnvironmentCommand extends Command {
  name = "environment"
  alias = "env"
  help = "Deletes a running environment."

  protected = true
  workflows = true
  streamEvents = true

  description = dedent`
    This will delete all services in the specified environment, and trigger providers to clear up any other resources
    and reset it. When you then run \`garden deploy\`, the environment will be reconfigured.

    This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
    resources.
  `

  outputsSchema = () =>
    joi.object().keys({
      providerStatuses: joiIdentifierMap(environmentStatusSchema()).description(
        "The status of each provider in the environment."
      ),
      serviceStatuses: joiIdentifierMap(serviceStatusSchema()).description(
        "The status of each service in the environment."
      ),
    })

  printHeader({ headerLog }) {
    printHeader(headerLog, `Deleting environment`, "skull_and_crossbones")
  }

  async action({ garden, isWorkflowStepCommand, log }: CommandParams): Promise<CommandResult<DeleteEnvironmentResult>> {
    const actions = await garden.getActionRouter()

    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const serviceStatuses = await actions.deleteServices(graph, log)

    log.info("")

    const providerStatuses = await actions.cleanupAll(log)

    return { result: { serviceStatuses, providerStatuses } }
  }
}

export const deleteServiceArgs = {
  services: new StringsParameter({
    help: "The name(s) of the service(s) to delete. Use comma as a separator to specify multiple services.",
  }),
}
type DeleteServiceArgs = typeof deleteServiceArgs

export class DeleteServiceCommand extends Command {
  name = "service"
  alias = "services"
  help = "Deletes running services."
  arguments = deleteServiceArgs

  protected = true
  workflows = true
  streamEvents = true

  description = dedent`
    Deletes (i.e. un-deploys) the specified services. Deletes all services in the project if no arguments are provided.
    Note that this command does not take into account any services depending on the deleted service/services, and might
    therefore leave the project in an unstable state. Running \`garden deploy\` will re-deploy any missing services.

    Examples:

        garden delete service my-service # deletes my-service
        garden delete service            # deletes all deployed services in the project
  `

  outputsSchema = () =>
    joiIdentifierMap(serviceStatusSchema()).description("A map of statuses for all the deleted services.")

  printHeader({ headerLog }) {
    printHeader(headerLog, "Delete service", "skull_and_crossbones")
  }

  async action({ garden, isWorkflowStepCommand, log, args }: CommandParams<DeleteServiceArgs>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const services = graph.getServices({ names: args.services })

    if (services.length === 0) {
      log.warn({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    const deleteServiceTasks = services.map((service) => {
      return new DeleteServiceTask({ garden, graph, log, service })
    })

    const result = deletedServiceStatuses(await garden.processTasks(deleteServiceTasks))

    return { result }
  }
}
