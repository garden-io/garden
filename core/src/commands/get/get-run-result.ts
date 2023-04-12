/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigGraph } from "../../graph/config-graph"
import { Command, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import chalk from "chalk"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts"
import { joiArray, joi } from "../../config/common"
import { StringParameter } from "../../cli/params"
import { GetRunResult, getRunResultSchema } from "../../plugin/handlers/Run/get-result"
import { createActionLog } from "../../logger/log-entry"

const getRunResultArgs = {
  name: new StringParameter({
    help: "The name of the run (or task, if using modules)",
    required: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Run)
    },
  }),
}

type Args = typeof getRunResultArgs

interface Result extends GetRunResult {
  artifacts: string[]
}

export type GetRunResultCommandResult = Result | null

export class GetRunResultCommand extends Command<Args, {}, GetRunResultCommandResult> {
  name = "run-result"
  help = "Outputs the latest result of a run (or task, if using modules)."
  aliases = ["task-result"]

  streamEvents = true

  arguments = getRunResultArgs

  outputsSchema = () =>
    getRunResultSchema()
      .keys({
        artifacts: joiArray(joi.string()).description(
          "Local file paths to any exported artifacts from the Run's execution."
        ),
      })
      .description("The output from the Run. May also return null if no Run result is found.")

  printHeader({ headerLog, args }) {
    const taskName = args.name
    printHeader(headerLog, `Run result for ${chalk.cyan(taskName)}`, "🚀")
  }

  async action({ garden, log, args }: CommandParams<Args>) {
    const graph: ConfigGraph = await garden.getConfigGraph({ log, emit: true })
    const action = graph.getRun(args.name)

    const router = await garden.getActionRouter()

    const resolved = await garden.resolveAction({ action, graph, log })
    const actionLog = createActionLog({ log: log, actionName: action.name, actionKind: action.kind })

    const { result: res } = await router.run.getResult({
      log: actionLog,
      action: resolved,
      graph,
    })

    let artifacts: string[] = []

    if (res.state === "ready") {
      artifacts = await getArtifactFileList({
        key: getArtifactKey("run", action.name, action.versionString()),
        artifactsPath: garden.artifactsPath,
        log: garden.log,
      })
    }

    log.info("")

    if (res.detail === null) {
      log.info(`Could not find results for ${action.longDescription()}`)
    } else {
      if (res.detail === undefined) {
        log.error(`Type ${action.type} for Run ${args.name} does not support storing/getting Run results.`)
      } else {
        log.info({ data: res })
      }
    }

    return { result: { ...res, artifacts } }
  }
}
