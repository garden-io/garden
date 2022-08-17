/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandGroup, CommandParams, CommandResult } from "./base"
import { NotFoundError } from "../exceptions"
import dedent from "dedent"
import { ServiceStatusMap, serviceStatusSchema } from "../types/service"
import { printHeader } from "../logger/util"
import { DeleteSecretResult } from "../plugin/handlers/provider/deleteSecret"
import { EnvironmentStatusMap } from "../plugin/handlers/provider/getEnvironmentStatus"
import { DeleteDeployTask, deletedDeployStatuses } from "../tasks/delete-service"
import { joi, joiIdentifierMap } from "../config/common"
import { environmentStatusSchema } from "../config/status"
import { BooleanParameter, StringParameter, StringsParameter } from "../cli/params"
import { deline } from "../util/string"
import { uniqByName } from "../util/util"
import { isDeployAction } from "../actions/deploy"

// TODO-G2 rename this to CleanupCommand, and do the same for all related classes, constants, variables and functions
export class DeleteCommand extends CommandGroup {
  name = "cleanup"
  aliases = ["del", "delete"]
  help = "Clean up resources."

  subCommands = [DeleteSecretCommand, DeleteEnvironmentCommand, DeleteDeployCommand]
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
  help = "Delete a secret from the namespace."
  protected = true

  description = dedent`
    Returns with an error if the provided key could not be found by the provider.

    Examples:

        garden cleanup secret kubernetes somekey
        garden cleanup secret local-kubernetes some-other-key
  `

  arguments = deleteSecretArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Cleanup secret", "skull_and_crossbones")
  }

  async action({ garden, log, args }: CommandParams<DeleteSecretArgs>): Promise<CommandResult<DeleteSecretResult>> {
    const key = args.key!
    const router = await garden.getActionRouter()
    const result = await router.provider.deleteSecret({ log, pluginName: args.provider!, key })

    if (result.found) {
      log.info(`Deleted config key ${args.key}`)
    } else {
      throw new NotFoundError(`Could not find config key ${args.key}`, { key })
    }

    return { result }
  }
}

const dependantsFirstOpt = {
  "dependants-first": new BooleanParameter({
    help: deline`
      Clean up deployments/services in reverse dependency order. That is, if service-a has a dependency on service-b, service-a
      will be deleted before service-b when calling \`garden cleanup namespace service-a,service-b --dependants-first\`.
      When this flag is not used, all services in the project are cleaned up simultaneously.
    `,
  }),
}

const deleteEnvironmentOpts = dependantsFirstOpt

type DeleteEnvironmentOpts = typeof dependantsFirstOpt

interface DeleteEnvironmentResult {
  providerStatuses: EnvironmentStatusMap
  deployStatuses: ServiceStatusMap
}

export class DeleteEnvironmentCommand extends Command<{}, DeleteEnvironmentOpts> {
  name = "namespace"
  aliases = ["environment", "env", "ns"]
  help = "Deletes a running namespace."

  protected = true
  streamEvents = true

  options = deleteEnvironmentOpts

  description = dedent`
    This will clean up everything deployed in the specified environment, and trigger providers to clear up any other resources
    and reset it. When you then run \`garden deploy\` after, the namespace will be reconfigured.

    This can be useful if you find the namespace to be in an inconsistent state, or need/want to free up resources.
  `

  outputsSchema = () =>
    joi.object().keys({
      providerStatuses: joiIdentifierMap(environmentStatusSchema()).description(
        "The status of each provider in the namespace."
      ),
      deployStatuses: joiIdentifierMap(serviceStatusSchema()).description(
        "The status of each deployment in the namespace."
      ),
    })

  printHeader({ headerLog }) {
    printHeader(headerLog, `Cleanup namespace`, "skull_and_crossbones")
  }

  async action({
    garden,
    log,
    opts,
  }: CommandParams<{}, DeleteEnvironmentOpts>): Promise<CommandResult<DeleteEnvironmentResult>> {
    const actions = await garden.getActionRouter()
    const graph = await garden.getConfigGraph({ log, emit: true })
    const serviceStatuses = await actions.deleteDeploys({
      graph,
      log,
      dependantsFirst: opts["dependants-first"],
    })

    log.info("")

    const providerStatuses = await actions.provider.cleanupAll(log)

    return { result: { deployStatuses: serviceStatuses, providerStatuses } }
  }
}

const deleteDeployArgs = {
  names: new StringsParameter({
    help:
      "The name(s) of the deploy(s) (or services if using modules) to delete. Use comma as a separator to specify multiple names.",
  }),
}
type DeleteDeployArgs = typeof deleteDeployArgs

const deleteDeployOpts = {
  ...dependantsFirstOpt,
  "with-dependants": new BooleanParameter({
    help: deline`
      Also clean up deployments/services that have dependencies on one of the deployments/services specified as CLI arguments
      (recursively).  When used, this option implies --dependants-first. Note: This option has no effect unless a list
      of names is specified as CLI arguments (since then, every deploy/service in the project will be deleted).
    `,
  }),
}
type DeleteDeployOpts = typeof deleteDeployOpts

export class DeleteDeployCommand extends Command<DeleteDeployArgs, DeleteDeployOpts> {
  name = "deploy"
  aliases = ["deploys", "service", "services"]
  help = "Cleans up running deployments (or services if using modules)."
  arguments = deleteDeployArgs

  protected = true
  workflows = true
  streamEvents = true

  options = deleteDeployOpts

  description = dedent`
    Cleans up (i.e. un-deploys) the specified actions. Cleans up all deploys/services in the project if no arguments are provided.
    Note that this command does not take into account any deploys depending on the cleaned up actions, and might
    therefore leave the project in an unstable state. Running \`garden deploy\` after will re-deploy anything missing.

    Examples:

        garden cleanup deploy my-service # deletes my-service
        garden cleanup deploy            # deletes all deployed services in the project
  `

  outputsSchema = () =>
    joiIdentifierMap(serviceStatusSchema()).description("A map of statuses for all the deleted deploys.")

  printHeader({ headerLog }) {
    printHeader(headerLog, "Cleaning up deployment(s)", "skull_and_crossbones")
  }

  async action({ garden, log, args, opts }: CommandParams<DeleteDeployArgs, DeleteDeployOpts>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph({ log, emit: true })
    let actions = graph.getDeploys({ names: args.names })

    if (actions.length === 0) {
      log.warn({ msg: "No deploys found. Aborting." })
      return { result: {} }
    }

    if (opts["with-dependants"]) {
      // Then we include service dependants (recursively) in the list of services to delete
      actions = uniqByName([
        ...actions,
        ...actions.flatMap((s) =>
          graph.getDependants({ kind: "Deploy", name: s.name, recursive: true }).filter(isDeployAction)
        ),
      ])
    }

    const dependantsFirst = opts["dependants-first"] || opts["with-dependants"]
    const deleteDeployNames = actions.map((a) => a.name)

    const tasks = actions.map((action) => {
      return new DeleteDeployTask({
        garden,
        graph,
        log,
        action,
        deleteDeployNames,
        dependantsFirst,
        force: false,
        forceActions: [],
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })
    })

    const processed = await garden.processTasks({ tasks, log })
    const result = deletedDeployStatuses(processed.results)

    return { result }
  }
}
