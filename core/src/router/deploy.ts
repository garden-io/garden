/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ActionState } from "../actions/types.js"
import { PluginEventBroker } from "../plugin-context.js"
import type { DeployState } from "../types/service.js"
import type { BaseRouterParams } from "./base.js"
import { createActionRouter } from "./base.js"

const API_ACTION_TYPE = "deploy"

export const deployRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("Deploy", baseParams, {
    deploy: async (params) => {
      const { router, action, garden } = params

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

      const output = await router.callHandler({ params, handlerType: "deploy" })
      const result = output.result
      await router.validateActionOutputs(action, "runtime", result.outputs)
      return output
    },

    delete: async (params) => {
      const { router, handlers } = params

      const log = params.log.createLog().info("Cleaning up...")

      const statusOutput = await handlers.getStatus({ ...params })
      const status = statusOutput.result

      if (status.detail?.state === "missing") {
        log.success("Not found")
        return statusOutput
      }

      const output = await router.callHandler({
        params: { ...params, log },
        handlerType: "delete",
        defaultHandler: async (p) => {
          const msg = `No delete handler available for ${p.action.kind} action type ${p.action.type}`
          p.log.error(msg)
          return {
            state: "not-ready" as ActionState,
            detail: { state: "missing" as DeployState, detail: {} },
            outputs: {},
          }
        },
      })

      log.success(`Done`)

      return output
    },

    exec: async (params) => {
      const result = await params.router.callHandler({ params, handlerType: "exec" })
      return result
    },

    getLogs: async (params) => {
      const { action, log } = params

      const result = await params.router.callHandler({
        params,
        handlerType: "getLogs",
        defaultHandler: async () => {
          log.warn(`No handler for log retrieval available for action type ${action.type}`)
          return {}
        },
      })
      return result
    },

    getStatus: async (params) => {
      const { router, action } = params
      const output = await router.callHandler({ params, handlerType: "getStatus" })
      const result = output.result
      await router.validateActionOutputs(action, "runtime", result.outputs)
      return output
    },

    getPortForward: async (params) => {
      return params.router.callHandler({ params, handlerType: "getPortForward" })
    },

    stopPortForward: async (params) => {
      return params.router.callHandler({ params, handlerType: "stopPortForward", defaultHandler: async () => ({}) })
    },

    getSyncStatus: async (params) => {
      const { action, log } = params

      return params.router.callHandler({
        params,
        handlerType: "getSyncStatus",
        defaultHandler: async () => {
          log.debug(`No getSyncStatus handler available for action type ${action.type}`)
          return {
            state: "unknown" as const,
          }
        },
      })
    },

    startSync: async (params) => {
      const { action, log } = params

      return params.router.callHandler({
        params,
        handlerType: "startSync",
        defaultHandler: async () => {
          log.debug(`No startSync handler available for action type ${action.type}`)
          return {}
        },
      })
    },

    stopSync: async (params) => {
      const { action, log } = params

      return params.router.callHandler({
        params,
        handlerType: "stopSync",
        defaultHandler: async () => {
          log.debug(`No stopSync handler available for action type ${action.type}`)
          return {}
        },
      })
    },
  })
