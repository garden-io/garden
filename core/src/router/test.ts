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
import { PluginEventBroker } from "../plugin-context.js"
import { copyArtifacts, getArtifactKey } from "../util/artifacts.js"
import { makeTempDir } from "../util/fs.js"
import type { BaseRouterParams } from "./base.js"
import { createActionRouter } from "./base.js"

const API_ACTION_TYPE = "test"

export const testRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("Test", baseParams, {
    run: async (params) => {
      const { action, garden, router } = params

      const tmpDir = await makeTempDir()
      const artifactsPath = normalizePath(await realpath(tmpDir.path))
      const actionUid = action.uid

      const actionName = action.name
      const actionType = API_ACTION_TYPE
      const actionVersion = action.versionString(params.log)
      const moduleName = action.moduleName()

      try {
        params.events = params.events || new PluginEventBroker(garden)

        // Annotate + emit log output
        params.events.on("log", ({ timestamp, msg, origin, level }) => {
          if (!params.interactive) {
            // stream logs to CLI; if interactive is true, the output will already be streamed to process.stdout
            // TODO: make sure that logs of different tests in the same module can be differentiated
            params.log[level]({ msg, origin })
          }
          // stream logs to Garden Cloud
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
            key: getArtifactKey("test", action.name, actionVersion),
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
