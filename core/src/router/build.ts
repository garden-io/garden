/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginEventBroker } from "../plugin-context.js"
import type { BaseRouterParams } from "./base.js"
import { createActionRouter } from "./base.js"
import type { PublishActionResult } from "../plugin/handlers/Build/publish.js"
import { styles } from "../logger/styles.js"
import { ACTION_RUNTIME_LOCAL } from "../plugin/base.js"

const API_ACTION_TYPE = "build"

export const buildRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("Build", baseParams, {
    getStatus: async (params) => {
      const { router, action } = params
      const statusOutput = await router.callHandler({
        params,
        handlerType: "getStatus",
        defaultHandler: async () => ({
          state: "unknown" as const,
          detail: {
            runtime: ACTION_RUNTIME_LOCAL,
          },
          outputs: {},
        }),
      })
      const status = statusOutput.result

      await router.validateActionOutputs(action, "runtime", status.outputs)
      return statusOutput
    },

    build: async (params) => {
      const { action, garden, router } = params

      const actionUid = action.uid
      params.events = params.events || new PluginEventBroker(garden)

      const actionName = action.name
      const actionType = API_ACTION_TYPE
      const moduleName = action.moduleName()

      params.events.on("log", ({ timestamp, msg, origin, level }) => {
        // stream logs to CLI
        params.log[level]({ msg, origin })
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

      const output = await router.callHandler({
        params,
        handlerType: "build",
        defaultHandler: async () => ({
          state: "unknown" as const,
          outputs: {},
          detail: {
            runtime: ACTION_RUNTIME_LOCAL,
          },
        }),
      })
      const { result } = output

      await router.validateActionOutputs(action, "runtime", result.outputs)

      return output
    },

    publish: async (params) => {
      return params.router.callHandler({ params, handlerType: "publish", defaultHandler: dummyPublishHandler })
    },
  })

const dummyPublishHandler = async ({ action }): Promise<PublishActionResult> => {
  return {
    state: "unknown",
    detail: {
      message: styles.warning(`No publish handler available for type ${action.type}`),
      published: false,
    },
    outputs: {},
  }
}
