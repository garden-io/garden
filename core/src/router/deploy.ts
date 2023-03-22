/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { omit } from "lodash"
import { ActionState, stateForCacheStatusEvent } from "../actions/types"
import { PluginEventBroker } from "../plugin-context"
import { DeployState } from "../types/service"
import { renderOutputStream } from "../util/util"
import { BaseRouterParams, createActionRouter } from "./base"

export const deployRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("Deploy", baseParams, {
    deploy: async (params) => {
      const { router, action, garden } = params

      const actionUid = action.getUid()
      params.events = params.events || new PluginEventBroker()

      const actionName = action.name
      const actionVersion = action.versionString()
      const moduleName = action.moduleName()

      params.events.on("log", ({ timestamp, data, origin, log }) => {
        // stream logs to CLI
        log.info(renderOutputStream(data.toString(), origin))
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

      const startedAt = new Date().toISOString()

      const payloadAttrs = {
        actionName,
        actionVersion,
        moduleName,
        actionUid,
        startedAt,
      }

      garden.events.emit("deployStatus", {
        ...payloadAttrs,
        state: "processing",
        status: { state: "deploying" },
      })

      const output = await router.callHandler({ params, handlerType: "deploy" })
      const result = output.result

      // TODO-G2: only validate if state is ready?
      await router.validateActionOutputs(action, "runtime", result.outputs)

      garden.events.emit("deployStatus", {
        ...payloadAttrs,
        state: result.state,
        completedAt: new Date().toISOString(),
        status: omit(result.detail, "detail"),
      })

      router.emitNamespaceEvents(result.detail?.namespaceStatuses)

      return output
    },

    // TODO @eysi: The type here should explictly be ActionLog
    delete: async (params) => {
      const { action, router, handlers } = params

      const log = params.log
        .createLog({
          section: action.key(),
        })
        .info("Deleting...")

      const statusOutput = await handlers.getStatus({ ...params })
      const status = statusOutput.result

      if (status.detail?.state === "missing") {
        log.success({
          section: action.key(),
          msg: "Not found",
        })
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

      router.emitNamespaceEvents(output.result.detail?.namespaceStatuses)

      // TODO @eysi: Validate that timestamp gets printed
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
          log.warn({
            section: action.key(),
            msg: chalk.yellow(`No handler for log retrieval available for action type ${action.type}`),
          })
          return {}
        },
      })
      return result
    },

    getStatus: async (params) => {
      const { garden, router, action } = params
      const actionName = action.name
      const actionVersion = action.versionString()

      const payloadAttrs = {
        actionName,
        actionVersion,
        actionUid: action.getUid(),
        moduleName: action.moduleName(),
        startedAt: new Date().toISOString(),
      }

      garden.events.emit("deployStatus", {
        ...payloadAttrs,
        state: "getting-status",
        status: { state: "unknown" },
      })

      const output = await router.callHandler({ params, handlerType: "getStatus" })
      const result = output.result

      garden.events.emit("deployStatus", {
        ...payloadAttrs,
        completedAt: new Date().toISOString(),
        state: stateForCacheStatusEvent(result.state),
        status: omit(result.detail, "detail"),
      })

      router.emitNamespaceEvents(result.detail?.namespaceStatuses)

      // TODO-G2: only validate if state is not missing?
      await router.validateActionOutputs(action, "runtime", result.outputs)

      return output
    },

    getPortForward: async (params) => {
      return params.router.callHandler({ params, handlerType: "getPortForward" })
    },

    stopPortForward: async (params) => {
      return params.router.callHandler({ params, handlerType: "stopPortForward" })
    },

    getSyncStatus: async (params) => {
      const { action, log } = params

      return params.router.callHandler({
        params,
        handlerType: "getSyncStatus",
        defaultHandler: async () => {
          log.debug({
            section: action.key(),
            msg: `No getSyncStatus handler available for action type ${action.type}`,
          })
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
          log.warn({
            section: action.key(),
            msg: chalk.yellow(`No startSync handler available for action type ${action.type}`),
          })
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
          log.warn({
            section: action.key(),
            msg: chalk.yellow(`No stopSync handler available for action type ${action.type}`),
          })
          return {}
        },
      })
    },
  })
