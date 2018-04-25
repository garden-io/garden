/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { every, reduce } from "lodash"
import { PluginContext } from "../../plugin-context"

import { Command } from "../base"
import { EntryStyle } from "../../logger/types"
import { EnvironmentStatus, EnvironmentStatusMap } from "../../types/plugin"
import { LogEntry } from "../../logger"
import { sleep } from "../../util"
import { TimeoutError } from "../../exceptions"

const WAIT_FOR_SHUTDOWN_TIMEOUT = 600

export type LogEntryMap = { [key: string]: LogEntry }

const providersTerminated = (status: EnvironmentStatusMap): boolean => every(status, s => s.configured === false)

export class EnvironmentDestroyCommand extends Command {
  name = "destroy"
  alias = "d"
  help = "Destroy environment"

  async action(ctx: PluginContext) {
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "skull_and_crossbones", command: `Destroying ${name} environment` })

    let result: EnvironmentStatusMap
    let logEntries: LogEntryMap = {}

    result = await ctx.destroyEnvironment()

    if (!providersTerminated(result)) {
      ctx.log.info("Waiting for providers to terminate")
      logEntries = reduce(result, (acc: LogEntryMap, status: EnvironmentStatus, provider: string) => {
        if (status.configured) {
          acc[provider] = ctx.log.info({
            section: provider,
            msg: "Terminating",
            entryStyle: EntryStyle.activity,
          })
        }
        return acc
      }, {})

      result = await this.waitForShutdown(ctx, name, logEntries)
    }

    ctx.log.finish()

    return result
  }

  async waitForShutdown(ctx: PluginContext, name: string, logEntries: LogEntryMap) {
    const startTime = new Date().getTime()
    let result: EnvironmentStatusMap

    while (true) {
      await sleep(2000)

      result = await ctx.getEnvironmentStatus()

      Object.keys(result).forEach(key => {
        if (result[key].configured && logEntries[key]) {
          logEntries[key].setSuccess("Terminated")
        }
      })

      if (providersTerminated(result)) {
        break
      }

      const now = new Date().getTime()
      if (now - startTime > WAIT_FOR_SHUTDOWN_TIMEOUT * 1000) {
        throw new TimeoutError(
          `Timed out waiting for ${name} delete to complete`,
          { environmentStatus: result },
        )
      }
    }

    return result
  }
}
