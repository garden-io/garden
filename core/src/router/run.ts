/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"
const { realpath } = fsExtra
import normalizePath from "normalize-path"
import tmp from "tmp-promise"
import { PluginEventBroker } from "../plugin-context.js"
import { copyArtifacts, getArtifactKey } from "../util/artifacts.js"
import type { BaseRouterParams } from "./base.js"
import { createActionRouter } from "./base.js"
import { logLevelFromString } from "../logger/logger.js"
import { uuidv4 } from "../util/random.js"

const API_ACTION_TYPE = "run"

export const runRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("Run", baseParams, {
    run: async (params) => {
      const { garden, router, action } = params

      const actionUid = action.uid
      const tmpDir = await tmp.dir({ unsafeCleanup: true })
      const artifactsPath = normalizePath(await realpath(tmpDir.path))

      const actionName = action.name
      const actionVersion = action.versionString(params.log)
      const actionType = API_ACTION_TYPE
      const moduleName = action.moduleName()

      params.events = params.events || new PluginEventBroker(garden)

      try {
        // Annotate + emit log output
        params.events.on("log", ({ timestamp, msg, origin, level }) => {
          if (!params.interactive) {
            // stream logs to CLI; if interactive is true, the output will already be streamed to process.stdout
            params.log[level]({ msg, origin })
          } else {
            // Make sure to send the log entry to Garden Cloud v2
            garden.events.emit("logEntry", {
              key: uuidv4(),
              timestamp,
              level: logLevelFromString(level),
              message: {
                msg: undefined,
                rawMsg: msg,
                error: "",
                section: "",
              },
              context: {
                type: "actionLog",
                actionName,
                actionKind: actionType,
                actionUid,
                origin: origin || "",
                sessionId: garden.sessionId,
                parentSessionId: garden.parentSessionId,
              },
            })
          }
          // stream logs to Garden Cloud (legacy)
          garden.events.emit("log", {
            timestamp,
            actionUid,
            actionName,
            actionType,
            moduleName,
            origin: origin || "",
            data: msg,
          })
        })

        const output = await router.callHandler({ params: { ...params, artifactsPath }, handlerType: "run" })
        const { result } = output

        await router.validateActionOutputs(action, "runtime", result.outputs)

        return output
      } finally {
        // Copy everything from the temp directory, and then clean it up
        try {
          await copyArtifacts({
            garden,
            log: params.log,
            artifactsPath,
            key: getArtifactKey("run", action.name, actionVersion),
          })
        } finally {
          await tmpDir.cleanup()
        }
      }
    },

    getResult: async (params) => {
      const { router, action } = params

      const output = await router.callHandler({
        params,
        handlerType: "getResult",
        defaultHandler: async () => ({ state: "unknown" as const, detail: null, outputs: {} }),
      })
      const { result } = output

      if (result) {
        await router.validateActionOutputs(action, "runtime", result.outputs)
      }

      return output
    },
  })
