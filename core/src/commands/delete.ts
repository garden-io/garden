/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command, CommandGroup } from "./base.js"
import dedent from "dedent"
import { printHeader } from "../logger/util.js"
import type { EnvironmentStatusMap } from "../plugin/handlers/Provider/getEnvironmentStatus.js"
import { DeleteDeployTask, deletedDeployStatuses } from "../tasks/delete-deploy.js"
import { joi, joiIdentifierMap, joiArray } from "../config/common.js"
import { environmentStatusSchema } from "../config/status.js"
import { BooleanParameter, StringsParameter } from "../cli/params.js"
import { deline } from "../util/string.js"
import { uniqByName } from "../util/util.js"
import { isDeployAction } from "../actions/deploy.js"
import { omit, mapValues } from "lodash-es"
import type { DeployStatus, DeployStatusMap } from "../plugin/handlers/Deploy/get-status.js"
import { getDeployStatusSchema } from "../plugin/handlers/Deploy/get-status.js"
import { CommandError, ConfigurationError, GardenError } from "../exceptions.js"
import { enumerate } from "../util/enumerate.js"
import { handleBulkOperationResult, noApiMsg, throwIfLegacyCloud } from "./helpers.js"
import { confirmDelete } from "./cloud/helpers.js"
import type { DeleteResult } from "./cloud/helpers.js"
import type { EmptyObject } from "type-fest"

// TODO: rename this to CleanupCommand, and do the same for all related classes, constants, variables and functions
export class DeleteCommand extends CommandGroup {
  name = "cleanup"
  override aliases = ["del", "delete"]
  help = "Clean up resources."

  subCommands = [DeleteEnvironmentCommand, DeleteDeployCommand, DeleteRemoteVariablesCommand]
}

const dependantsFirstOpt = {
  "dependants-first": new BooleanParameter({
    help: dedent`
      Clean up Deploy(s) (or services if using modules) in reverse dependency order. That is, if service-a has a dependency on service-b, service-a will be deleted before service-b when calling \`garden cleanup namespace service-a,service-b --dependants-first\`.

      When this flag is not used, all services in the project are cleaned up simultaneously.
    `,
  }),
}

const forceOpt = {
  force: new BooleanParameter({
    help: deline`
      Force cleanup/deletion of Deploy(s) that have \`removeOnCleanup: false\` set in their configuration.
      By default, such deploys are skipped during cleanup.
    `,
  }),
}

const deleteEnvironmentOpts = {
  ...dependantsFirstOpt,
  ...forceOpt,
}

type DeleteEnvironmentOpts = typeof deleteEnvironmentOpts

interface DeleteEnvironmentResult {
  providerStatuses: EnvironmentStatusMap
  deployStatuses: {
    [name: string]: DeployStatus
  }
}

export class DeleteEnvironmentCommand extends Command<{}, DeleteEnvironmentOpts> {
  name = "namespace"
  override aliases = ["environment", "env", "ns"]
  help = "Deletes a running namespace."

  override protected = true
  override streamEvents = true
  override streamLogEntriesV2 = true

  override options = deleteEnvironmentOpts

  override description = dedent`
    This will clean up everything deployed in the specified environment, and trigger providers to clear up any other resources
    and reset it. When you then run \`garden deploy\` after, the namespace will be reconfigured.

    This can be useful if you find the namespace to be in an inconsistent state, or need/want to free up resources.

    Deploys with \`removeOnCleanup: false\` set in their configuration are skipped by default. Use the \`--force\` flag to
    override this and clean up all deploys regardless.
  `

  override outputsSchema = () =>
    joi.object().keys({
      providerStatuses: joiIdentifierMap(environmentStatusSchema()).description(
        "The status of each provider in the namespace."
      ),
      deployStatuses: joiIdentifierMap(getDeployStatusSchema()).description(
        "The status of each deployment in the namespace."
      ),
    })

  override printHeader({ log }) {
    printHeader(log, `Cleanup namespace`, "♻️")
  }

  async action({
    garden,
    log,
    opts,
  }: CommandParams<EmptyObject, DeleteEnvironmentOpts>): Promise<CommandResult<DeleteEnvironmentResult>> {
    const actions = await garden.getActionRouter()
    const graph = await garden.getConfigGraph({ log, emit: true })
    const deployStatuses = await actions.deleteDeploys({
      graph,
      log,
      dependantsFirst: opts["dependants-first"],
      force: opts["force"],
    })

    log.info("")

    const providerStatuses = await actions.provider.cleanupAll(log)

    log.success({ msg: "\nDone!", showDuration: false })

    return {
      result: {
        deployStatuses: <DeployStatusMap>mapValues(deployStatuses, (s) => omit(s, ["version", "executedAction"])),
        providerStatuses,
      },
    }
  }
}

const deleteDeployArgs = {
  names: new StringsParameter({
    help: "The name(s) of the deploy(s) (or services if using modules) to delete. You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}
type DeleteDeployArgs = typeof deleteDeployArgs

const deleteDeployOpts = {
  ...dependantsFirstOpt,
  ...forceOpt,
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
  override aliases = ["deploys", "service", "services"]
  help = "Cleans up running deployments (or services if using modules)."
  override arguments = deleteDeployArgs

  override protected = true
  workflows = true
  override streamEvents = true
  override streamLogEntriesV2 = true

  override options = deleteDeployOpts

  override description = dedent`
    Cleans up (i.e. un-deploys) the specified actions. Cleans up all deploys/services in the project if no arguments are provided.
    Note that this command does not take into account any deploys depending on the cleaned up actions, and might
    therefore leave the project in an unstable state. Running \`garden deploy\` after will re-deploy anything missing.

    Deploys with \`removeOnCleanup: false\` set in their configuration are skipped by default. Use the \`--force\` flag to
    override this and clean up all deploys/services regardless.

    Examples:

        garden cleanup deploy my-service # deletes my-service
        garden cleanup deploy            # deletes all deployed services in the project
        garden cleanup deploy --force    # deletes all deployed services, including those with removeOnCleanup: false
  `

  override outputsSchema = () =>
    joiIdentifierMap(
      getDeployStatusSchema().keys({
        version: joi.string(),
      })
    ).description("A map of statuses for all the deleted deploys.")

  override printHeader({ log }) {
    printHeader(log, "Cleaning up deployment(s)", "♻️")
  }

  async action({ garden, log, args, opts }: CommandParams<DeleteDeployArgs, DeleteDeployOpts>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph({ log, emit: true })
    let actions = graph.getDeploys({ names: args.names })

    if (actions.length === 0) {
      log.warn({ msg: "No deploys found. Aborting." })
      return { result: {} }
    }

    // Filter out actions with removeOnCleanup = false, unless --force is set
    if (!opts["force"]) {
      const skippedActions = actions.filter((a) => a.getConfig("removeOnCleanup") === false)
      if (skippedActions.length > 0) {
        log.info(`Skipping cleanup for ${skippedActions.map((a) => a.name).join(", ")} (removeOnCleanup = false)`)
        actions = actions.filter((a) => a.getConfig("removeOnCleanup") !== false)
      }

      if (actions.length === 0) {
        log.warn({ msg: "No deploys to clean up after filtering. Aborting." })
        return { result: {} }
      }
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
      })
    })

    const processed = await garden.processTasks({ tasks })
    const result = deletedDeployStatuses(processed.results)

    log.success({ msg: "\nDone!", showDuration: false })

    return { result }
  }
}

export const deleteRemoteVariablesArgs = {
  ids: new StringsParameter({
    help: deline`The ID(s) of the cloud variables to delete.`,
    spread: true,
  }),
}

type DeleteRemoteVariablesArgs = typeof deleteRemoteVariablesArgs

export class DeleteRemoteVariablesCommand extends Command<DeleteRemoteVariablesArgs> {
  name = "remote-variables"
  help = "Delete remote variables from Garden Cloud."
  emoji = "☁️"

  override aliases = ["cloud-variables"]

  override description = dedent`
    Delete remote variables in Garden Cloud. You will need the IDs of the variables you want to delete,
    which you can get from the \`garden get remote-variables\` command.

    Examples:
        garden delete remote-variables <ID 1> <ID 2> <ID 3>   # delete the remote variables with the given IDs.
  `

  override arguments = deleteRemoteVariablesArgs

  override printHeader({ log }) {
    printHeader(log, "Delete remote variables", "☁️")
  }

  override outputsSchema = () =>
    joi.object().keys({
      variables: joiArray(
        joi.object().keys({
          id: joi.string(),
          success: joi.boolean(),
        })
      ).description("A list of deleted variables"),
    })

  async action({ garden, args, log, opts }: CommandParams<DeleteRemoteVariablesArgs>): Promise<CommandResult> {
    throwIfLegacyCloud(garden, "garden cloud variables delete")

    const variablesToDelete = args.ids || []
    if (variablesToDelete.length === 0) {
      throw new CommandError({
        message: `No variable IDs provided.`,
      })
    }

    if (!opts.yes && !(await confirmDelete("remote variable", variablesToDelete.length))) {
      return {}
    }

    if (!garden.cloudApi) {
      throw new ConfigurationError({ message: noApiMsg("delete", "remote variables") })
    }

    const cmdLog = log.createLog({ name: "variables-command" })
    cmdLog.info("Deleting remote variables...")

    const errors: { identifier: string; message?: string }[] = []
    const results: DeleteResult[] = []
    for (const [counter, id] of enumerate(variablesToDelete, 1)) {
      cmdLog.info({ msg: `Deleting remote variables... → ${counter}/${variablesToDelete.length}` })
      try {
        const res = await garden.cloudApi.trpc.variable.delete.mutate({
          organizationId: garden.cloudApi.organizationId,
          variableId: id,
        })
        results.push({ id, status: res.success ? "success" : "error" })
      } catch (err) {
        if (!(err instanceof GardenError)) {
          throw err
        }
        errors.push({
          identifier: id,
          message: err.message,
        })
      }
    }

    return handleBulkOperationResult({
      log,
      cmdLog,
      errors,
      action: "delete",
      resource: "variable",
      results,
    })
  }
}
