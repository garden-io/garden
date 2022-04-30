/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

import { Omit, uuidv4 } from "../util/util"
import { PluginEventBroker } from "../plugin-context"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../graph/config-graph"
import { BuildAction } from "../actions/build"
import { BuildActionDescriptions, BuildActionParams, BuildActionResults } from "../plugin/action-types"
import { BaseActionRouter, CommonParams } from "./base"
import { BuildState } from "../plugin/handlers/build/build"

type BuildActionRouterParams<N extends keyof BuildActionDescriptions, T extends BuildAction> = Omit<
  BuildActionParams<N, T>,
  CommonParams
> & {
  graph: ConfigGraph
  pluginName?: string
}

@Profile()
export class BuildRouter extends BaseActionRouter<"build"> {
  async getStatus<T extends BuildAction>(
    params: BuildActionRouterParams<"getStatus", T>
  ): Promise<BuildActionResults<"getStatus", T>> {
    const status = await this.callHandler({
      params,
      handlerType: "getStatus",
      defaultHandler: async () => ({ ready: false }),
    })
    if (status.ready) {
      // Then an actual build won't take place, so we emit a build status event to that effect.
      const { action } = params
      const actionVersion = action.getVersionString()
      this.garden.events.emit("buildStatus", {
        moduleName: action.getModuleName(),
        moduleVersion: actionVersion,
        actionName: action.name,
        actionVersion,
        status: { state: "fetched" },
      })
    }
    return status
  }

  async build<T extends BuildAction>(
    params: BuildActionRouterParams<"build", T>
  ): Promise<BuildActionResults<"build", T>> {
    const actionUid = uuidv4()
    params.events = params.events || new PluginEventBroker()

    let result: BuildActionResults<"build", T>
    const startedAt = new Date()

    const { action } = params
    const actionName = action.name
    const actionVersion = action.getVersionString()
    const moduleVersion = actionVersion
    const moduleName = action.getModuleName()

    params.events.on("log", ({ timestamp, data }) => {
      this.garden.events.emit("log", {
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
    this.garden.events.emit("buildStatus", {
      actionName,
      actionVersion,
      moduleName,
      moduleVersion,
      actionUid,
      status: { state: "building", startedAt },
    })

    const emitBuildStatusEvent = (state: BuildState) => {
      this.garden.events.emit("buildStatus", {
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
      result = await this.callHandler({
        params,
        handlerType: "build",
        defaultHandler: async () => ({}),
      })
      emitBuildStatusEvent("built")
    } catch (err) {
      emitBuildStatusEvent("failed")
      throw err
    }

    return result
  }

  async publish<T extends BuildAction>(
    params: BuildActionRouterParams<"publish", T>
  ): Promise<BuildActionResults<"publish", T>> {
    return this.callHandler({ params, handlerType: "publish", defaultHandler: dummyPublishHandler })
  }

  async run<T extends BuildAction>(params: BuildActionRouterParams<"run", T>): Promise<BuildActionResults<"run", T>> {
    const result = await this.callHandler({ params, handlerType: "run" })
    this.emitNamespaceEvent(result.namespaceStatus)
    return result
  }
}

const dummyPublishHandler = async ({ module }) => {
  return {
    message: chalk.yellow(`No publish handler available for module type ${module.type}`),
    published: false,
  }
}
