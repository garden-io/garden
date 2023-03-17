/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { realpath } from "fs-extra"
import normalizePath from "normalize-path"
import { ActionState, stateForCacheStatusEvent } from "../actions/types"
import { PluginEventBroker } from "../plugin-context"
import { runStatusForEventPayload } from "../plugin/base"
import { copyArtifacts, getArtifactKey } from "../util/artifacts"
import { makeTempDir } from "../util/fs"
import { renderOutputStream } from "../util/util"
import { BaseRouterParams, createActionRouter } from "./base"

export const testRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("Test", baseParams, {
    run: async (params) => {
      const { action, garden, router } = params

      const tmpDir = await makeTempDir()
      const artifactsPath = normalizePath(await realpath(tmpDir.path))
      const actionUid = action.getUid()

      const actionName = action.name
      const actionVersion = action.versionString()
      const moduleName = action.moduleName()

      const payloadAttrs = {
        actionName,
        actionVersion,
        moduleName,
        actionUid,
        startedAt: new Date().toISOString(),
      }

      garden.events.emit("testStatus", {
        ...payloadAttrs,
        state: "processing",
        status: { state: "running" },
      })

      params.events = params.events || new PluginEventBroker()

      try {
        // Annotate + emit log output
        params.events.on("log", ({ timestamp, data, origin, log }) => {
          if (!params.interactive) {
            // stream logs to CLI; if interactive is true, the output will already be streamed to process.stdout
            // TODO: 0.13 make sure that logs of different tests in the same module can be differentiated
            log.info(renderOutputStream(data.toString(), origin))
          }
          // stream logs to Garden Cloud
          garden.events.emit("log", {
            timestamp,
            actionUid,
            actionName,
            moduleName,
            origin,
            data: data.toString(),
          })
        })

        const result = await router.callHandler({ params: { ...params, artifactsPath }, handlerType: "run" })

        await router.validateActionOutputs(action, "runtime", result.outputs)

        // Emit status
        garden.events.emit("testStatus", {
          ...payloadAttrs,
          completedAt: new Date().toISOString(),
          state: result.state,
          status: runStatusForEventPayload(result.detail),
        })
        // TODO-G2: get this out of the core framework and shift it to the provider
        router.emitNamespaceEvent(result.detail?.namespaceStatus)

        return result
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
      const { garden, router, action } = params

      const actionName = action.name
      const actionVersion = action.versionString()

      const payloadAttrs = {
        actionName,
        actionVersion,
        moduleName: action.moduleName(),
        actionUid: action.getUid(),
        startedAt: new Date().toISOString(),
      }

      garden.events.emit("testStatus", {
        ...payloadAttrs,
        state: "getting-status",
        status: { state: "unknown" },
      })

      const result = await router.callHandler({
        params,
        handlerType: "getResult",
        defaultHandler: async () => ({ state: <ActionState>"unknown", detail: null, outputs: {} }),
      })

      garden.events.emit("testStatus", {
        ...payloadAttrs,
        state: stateForCacheStatusEvent(result.state),
        completedAt: new Date().toISOString(),
        status: runStatusForEventPayload(result.detail),
      })

      if (result) {
        await router.validateActionOutputs(action, "runtime", result.outputs)
      }

      return result
    },
  })
