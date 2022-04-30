/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { omit } from "lodash"
import { PluginEventBroker } from "../plugin-context"
import { emptyRuntimeContext } from "../runtime-context"
import { ServiceState } from "../types/service"
import { uuidv4 } from "../util/util"
import { BaseRouterParams, createActionRouter } from "./base"

export const deployRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("deploy", baseParams, {
    deploy: async (params) => {
      const { router, action, garden } = params

      const actionUid = uuidv4()
      params.events = params.events || new PluginEventBroker()

      const actionName = action.name
      const serviceName = actionName
      const actionVersion = action.versionString()
      const moduleVersion = actionVersion
      const serviceVersion = actionVersion
      const moduleName = action.moduleName()

      params.events.on("log", ({ timestamp, data }) => {
        garden.events.emit("log", {
          timestamp,
          actionUid,
          entity: {
            type: "deploy",
            key: `${serviceName}`,
            moduleName,
          },
          data: data.toString(),
        })
      })

      const deployStartedAt = new Date()

      garden.events.emit("serviceStatus", {
        actionName,
        actionVersion,
        serviceName,
        moduleName,
        moduleVersion,
        serviceVersion,
        actionUid,
        status: { state: "deploying", deployStartedAt },
      })

      const result = await router.callHandler({ params, handlerType: "deploy" })

      garden.events.emit("serviceStatus", {
        actionName,
        actionVersion,
        serviceName,
        moduleName,
        moduleVersion,
        serviceVersion,
        actionUid,
        status: {
          ...omit(result, "detail"),
          deployStartedAt,
          deployCompletedAt: new Date(),
        },
      })

      router.emitNamespaceEvents(result.namespaceStatuses)

      return result
    },

    delete: async (params) => {
      const { action, router, handlers } = params

      const log = params.log.info({
        section: action.key(),
        msg: "Deleting...",
        status: "active",
      })

      const runtimeContext = emptyRuntimeContext
      const status = await handlers.getStatus({ ...params, runtimeContext, devMode: false })

      if (status.state === "missing") {
        log.setSuccess({
          section: action.key(),
          msg: "Not found",
        })
        return status
      }

      const result = await router.callHandler({
        params: { ...params, log },
        handlerType: "delete",
        defaultHandler: async (p) => {
          const msg = `No delete service handler available for action type ${p.action.type}`
          p.log.setError(msg)
          return { state: "missing" as ServiceState, detail: {} }
        },
      })

      router.emitNamespaceEvents(result.namespaceStatuses)

      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })

      return result
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

      const result = await router.callHandler({ params, handlerType: "getStatus" })

      const actionName = action.name
      const actionVersion = action.versionString()

      garden.events.emit("serviceStatus", {
        actionName,
        actionVersion,
        serviceName: actionName,
        moduleVersion: actionVersion,
        moduleName: action.moduleName(),
        serviceVersion: actionVersion,
        status: omit(result, "detail"),
      })

      router.emitNamespaceEvents(result.namespaceStatuses)
      // TODO-G2
      // this.validateServiceOutputs(params.service, result)
      return result
    },

    run: async (params) => {
      const { router } = params
      const result = await router.callHandler({ params, handlerType: "run" })
      router.emitNamespaceEvent(result.namespaceStatus)
      return result
    },

    getPortForward: async (params) => {
      return params.router.callHandler({ params, handlerType: "getPortForward" })
    },

    stopPortForward: async (params) => {
      return params.router.callHandler({ params, handlerType: "stopPortForward" })
    },
  })

// private validateServiceOutputs(service: GardenService, result: ServiceStatus) {
//   const spec = this.moduleTypes[service.module.type]

//   if (spec.serviceOutputsSchema) {
//     result.outputs = validateSchema(result.outputs, spec.serviceOutputsSchema, {
//       context: `outputs from service '${service.name}'`,
//       ErrorClass: PluginError,
//     })
//   }

//   for (const base of getModuleTypeBases(spec, this.moduleTypes)) {
//     if (base.serviceOutputsSchema) {
//       result.outputs = validateSchema(result.outputs, base.serviceOutputsSchema.unknown(true), {
//         context: `outputs from service '${service.name}' (base schema from '${base.name}' plugin)`,
//         ErrorClass: PluginError,
//       })
//     }
//   }
// }
