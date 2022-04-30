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
import { PluginEventBroker } from "../plugin-context"
import { runStatus } from "../plugin/base"
import { copyArtifacts, getArtifactKey } from "../util/artifacts"
import { uuidv4 } from "../util/util"
import { BaseRouterParams, createActionRouter } from "./base"

export const testRouter = (baseParams: BaseRouterParams) =>
  createActionRouter("test", baseParams, {
    run: async (params) => {
      const { action, garden, router } = params

      const tmpDir = await tmp.dir({ unsafeCleanup: true })
      const artifactsPath = normalizePath(await realpath(tmpDir.path))
      const actionUid = uuidv4()

      const actionName = action.name
      const actionVersion = action.versionString()
      const testName = actionName
      const testVersion = actionVersion
      const moduleName = action.moduleName()
      const moduleVersion = actionVersion

      garden.events.emit("testStatus", {
        actionName,
        actionVersion,
        testName,
        moduleName,
        moduleVersion,
        testVersion,
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
              type: "test",
              key: `${moduleName}.${testName}`,
              moduleName,
            },
            data: data.toString(),
          })
        })

        const result = await router.callHandler({ params: { ...params, artifactsPath }, handlerType: "run" })

        // Emit status
        garden.events.emit("testStatus", {
          actionName,
          actionVersion,
          testName,
          moduleName,
          moduleVersion,
          testVersion,
          actionUid,
          status: runStatus(result.result),
        })
        router.emitNamespaceEvent(result.result?.namespaceStatus)

        return result
      } finally {
        // Copy everything from the temp directory, and then clean it up
        try {
          await copyArtifacts({
            garden,
            log: params.log,
            artifactsPath,
            key: getArtifactKey("test", action.name, actionVersion)
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
        defaultHandler: async () => null,
      })

      const actionName = action.name
      const actionVersion = action.versionString()

      garden.events.emit("testStatus", {
        actionName,
        actionVersion,
        testName: actionName,
        moduleName: action.moduleName(),
        moduleVersion: actionVersion,
        testVersion: actionVersion,
        status: runStatus(result.result),
      })

      return result
    },
  })
