/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { realpath } from "fs-extra"
import normalizePath from "normalize-path"
import tmp from "tmp-promise"
import { ActionState } from "../actions/base"
import { PluginEventBroker } from "../plugin-context"
import { runStatus } from "../plugin/base"
import { copyArtifacts, getArtifactKey } from "../util/artifacts"
import { uuidv4 } from "../util/util"
import { BaseRouterParams, createActionRouter } from "./base"

export const runRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("run", baseParams, {
    run: async (params) => {
      const { garden, router, action } = params

      const actionUid = uuidv4()
      const tmpDir = await tmp.dir({ unsafeCleanup: true })
      const artifactsPath = normalizePath(await realpath(tmpDir.path))

      const actionName = action.name
      const actionVersion = action.versionString()
      const taskName = actionName
      const taskVersion = actionVersion
      const moduleName = action.moduleName()
      const moduleVersion = actionVersion

      garden.events.emit("taskStatus", {
        actionName,
        actionVersion,
        taskName,
        moduleName,
        moduleVersion,
        taskVersion,
        actionUid,
        status: { state: "running", startedAt: new Date() },
      })

      params.events = params.events || new PluginEventBroker()

      try {
        // Annotate + emit log output
        params.events.on("log", ({ timestamp, data }) => {
          garden.events.emit("log", {
            timestamp,
            actionUid,
            entity: {
              type: "task",
              key: taskName,
              moduleName,
            },
            data: data.toString(),
          })
        })

        const result = await router.callHandler({ params: { ...params, artifactsPath }, handlerType: "run" })

        await router.validateActionOutputs(action, result.outputs)

        // Emit status
        garden.events.emit("taskStatus", {
          actionName,
          actionVersion,
          taskName,
          moduleName,
          moduleVersion,
          taskVersion,
          actionUid,
          status: runStatus(result.detail),
        })
        // result && this.validateTaskOutputs(params.task, result)
        router.emitNamespaceEvent(result.detail?.namespaceStatus)

        return result
      } finally {
        // Copy everything from the temp directory, and then clean it up
        try {
          await copyArtifacts({
            garden,
            log: params.log,
            artifactsPath,
            key: getArtifactKey("task", action.name, actionVersion),
          })
        } finally {
          await tmpDir.cleanup()
        }
      }
    },

    getResult: async (params) => {
      const { garden, router, action } = params

      const result = await router.callHandler({
        params,
        handlerType: "getResult",
        defaultHandler: async () => ({ state: <ActionState>"unknown", detail: null, outputs: null }),
      })

      const actionName = action.name
      const actionVersion = action.versionString()
      const taskName = actionName
      const taskVersion = actionVersion
      const moduleName = action.moduleName()
      const moduleVersion = actionVersion

      garden.events.emit("taskStatus", {
        actionName,
        actionVersion,
        taskName,
        moduleName,
        moduleVersion,
        taskVersion,
        status: runStatus(result.detail),
      })

      if (result) {
        await router.validateActionOutputs(action, result.outputs)
      }

      return result
    },
  })

// TODO-G2
// private validateTaskOutputs(task: GardenTask, result: RunTaskResult) {
//   const spec = this.moduleTypes[task.module.type]

//   if (spec.taskOutputsSchema) {
//     result.outputs = validateSchema(result.outputs, spec.taskOutputsSchema, {
//       context: `outputs from task '${task.name}'`,
//       ErrorClass: PluginError,
//     })
//   }

//   for (const base of getModuleTypeBases(spec, this.moduleTypes)) {
//     if (base.taskOutputsSchema) {
//       result.outputs = validateSchema(result.outputs, base.taskOutputsSchema.unknown(true), {
//         context: `outputs from task '${task.name}' (base schema from '${base.name}' plugin)`,
//         ErrorClass: PluginError,
//       })
//     }
//   }
// }
