/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

import { uuidv4 } from "../util/util"
import { PluginEventBroker } from "../plugin-context"
import { BuildState } from "../plugin/handlers/build/build"
import { BaseRouterParams, createActionRouter } from "./base"
import { ActionState } from "../actions/base"
import { PublishActionResult } from "../plugin/handlers/build/publish"

export const buildRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("build", baseParams, {
    getStatus: async (params) => {
      const { router, action, garden } = params

      const status = await router.callHandler({
        params,
        handlerType: "getStatus",
        defaultHandler: async () => ({ state: <ActionState>"unknown", detail: {}, outputs: {} }),
      })

      await router.validateActionOutputs(action, status.outputs)

      if (status.state === "ready") {
        // Then an actual build won't take place, so we emit a build status event to that effect.
        const actionVersion = action.versionString()

        garden.events.emit("buildStatus", {
          moduleName: action.moduleName(),
          moduleVersion: actionVersion,
          actionName: action.name,
          actionVersion,
          status: { state: "fetched" },
        })
      }
      return status
    },

    build: async (params) => {
      const { action, garden, router } = params

      const actionUid = uuidv4()
      params.events = params.events || new PluginEventBroker()

      const startedAt = new Date()

      const actionName = action.name
      const actionVersion = action.versionString()
      const moduleVersion = actionVersion
      const moduleName = action.moduleName()

      params.events.on("log", ({ timestamp, data }) => {
        garden.events.emit("log", {
          timestamp,
          actionUid,
          entity: {
            type: "build",
            key: `${moduleName}`,
            moduleName,
          },
          data: data.toString(),
        })
      })
      garden.events.emit("buildStatus", {
        actionName,
        actionVersion,
        moduleName,
        moduleVersion,
        actionUid,
        status: { state: "building", startedAt },
      })

      const emitBuildStatusEvent = (state: BuildState) => {
        garden.events.emit("buildStatus", {
          actionName,
          actionVersion,
          moduleName,
          moduleVersion,
          actionUid,
          status: {
            state,
            startedAt,
            completedAt: new Date(),
          },
        })
      }

      try {
        const result = await router.callHandler({
          params,
          handlerType: "build",
          defaultHandler: async () => ({ outputs: {} }),
        })

        await router.validateActionOutputs(action, result.outputs)

        emitBuildStatusEvent("built")
        return result
      } catch (err) {
        emitBuildStatusEvent("failed")
        throw err
      }
    },

    publish: async (params) => {
      return params.router.callHandler({ params, handlerType: "publish", defaultHandler: dummyPublishHandler })
    },

    run: async (params) => {
      const { router } = params
      const result = await router.callHandler({ params, handlerType: "run" })
      router.emitNamespaceEvent(result.namespaceStatus)
      return result
    },
  })

const dummyPublishHandler = async ({ action }): Promise<PublishActionResult> => {
  return {
    state: "unknown",
    detail: {
      message: chalk.yellow(`No publish handler available for type ${action.type}`),
      published: false,
    },
    outputs: {},
  }
}
