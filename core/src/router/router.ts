/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "../garden.js"
import type { Log } from "../logger/log-entry.js"
import type { GardenPluginSpec, ModuleTypeDefinition, PluginActionContextParams } from "../plugin/plugin.js"
import { getDeployStatuses } from "../tasks/helpers.js"
import { DeleteDeployTask, deletedDeployStatuses } from "../tasks/delete-deploy.js"
import { DeployTask } from "../tasks/deploy.js"
import { Profile } from "../util/profiling.js"
import type { ConfigGraph } from "../graph/config-graph.js"
import { ProviderRouter } from "./provider.js"
import type { ActionKindRouter, WrappedActionRouterHandlers } from "./base.js"
import { BaseRouter } from "./base.js"
import { ModuleRouter } from "./module.js"
import { buildRouter } from "./build.js"
import { deployRouter } from "./deploy.js"
import { runRouter } from "./run.js"
import { testRouter } from "./test.js"
import type { DeployStatus, DeployStatusMap } from "../plugin/handlers/Deploy/get-status.js"
import type { GetActionOutputsParams, GetActionOutputsResult } from "../plugin/handlers/base/get-outputs.js"
import type { ActionKind, BaseActionConfig, ResolvedAction } from "../actions/types.js"

export interface DeployManyParams {
  graph: ConfigGraph
  log: Log
  deployNames?: string[]
  force?: boolean
  forceBuild?: boolean
}

/**
 * The ActionRouter takes care of choosing which plugin should be responsible for handling an action,
 * and preparing common parameters (so as to reduce boilerplate on the usage side).
 *
 * Each plugin and module action has a corresponding method on this class (aside from configureProvider, which
 * is handled especially elsewhere).
 */
@Profile()
export class ActionRouter extends BaseRouter {
  public readonly provider: ProviderRouter
  public readonly module: ModuleRouter
  public readonly build: WrappedActionRouterHandlers<"Build">
  public readonly deploy: WrappedActionRouterHandlers<"Deploy">
  public readonly run: WrappedActionRouterHandlers<"Run">
  public readonly test: WrappedActionRouterHandlers<"Test">

  constructor(
    garden: Garden,
    configuredPlugins: GardenPluginSpec[],
    loadedPlugins: GardenPluginSpec[],
    moduleTypes: { [name: string]: ModuleTypeDefinition }
  ) {
    const baseParams = { garden, configuredPlugins, loadedPlugins }
    super(baseParams)

    this.provider = new ProviderRouter(baseParams)
    this.module = new ModuleRouter(baseParams, moduleTypes)
    this.build = buildRouter(baseParams)
    this.deploy = deployRouter(baseParams)
    this.run = runRouter(baseParams)
    this.test = testRouter(baseParams)

    garden.log.silly(() => `Creating ActionRouter with ${configuredPlugins.length} configured providers`)
  }

  //===========================================================================
  //region Helper Methods
  //===========================================================================

  getRouterForActionKind<K extends ActionKind>(kind: K): ActionKindRouter<K> {
    return this[kind.toLowerCase()]
  }

  async configureAction<K extends ActionKind>({ config, log }: { config: BaseActionConfig<K>; log: Log }) {
    const router = this.getRouterForActionKind(config.kind)
    return router.configure({ config, log })
  }

  async getActionOutputs<T extends ResolvedAction>(
    params: Omit<GetActionOutputsParams<T>, keyof PluginActionContextParams | "action"> & {
      action: T
      graph: ConfigGraph
    }
  ): Promise<GetActionOutputsResult> {
    const router = this.getRouterForActionKind(params.action.kind)

    const output = await router.callHandler({
      handlerType: "getOutputs",
      // TODO: figure out why the typing clashes here
      params: { ...params, action: <any>params.action, events: undefined },
      defaultHandler: async ({}) => ({ outputs: {} }),
    })

    return output.result
  }

  async getDeployStatuses({
    log,
    graph,
    names,
  }: {
    log: Log
    graph: ConfigGraph
    names?: string[]
  }): Promise<{ [name: string]: DeployStatus }> {
    const actions = graph.getDeploys({ names })

    const tasks = actions.map(
      (action) =>
        new DeployTask({
          force: false,
          garden: this.garden,
          graph,
          log,
          action,

          forceActions: [],
        })
    )
    const { results } = await this.garden.processTasks({ tasks, throwOnError: true, statusOnly: true })

    return getDeployStatuses(results)
  }

  async deployMany({ graph, deployNames, force = false, forceBuild = false, log }: DeployManyParams) {
    const deploys = graph.getDeploys({ names: deployNames })

    const tasks = deploys.map(
      (action) =>
        new DeployTask({
          garden: this.garden,
          log,
          graph,
          action,
          force,
          forceActions: forceBuild ? graph.getBuilds() : [],
        })
    )

    return this.garden.processTasks({ tasks })
  }

  /**
   * Deletes all or specified deployments in the environment.
   */
  async deleteDeploys({
    graph,
    log,
    names,
    dependantsFirst,
    force,
  }: {
    graph: ConfigGraph
    log: Log
    dependantsFirst?: boolean
    names?: string[]
    force?: boolean
  }): Promise<DeployStatusMap> {
    const servicesLog = log.createLog({}).info("Deleting deployments...")
    let deploys = graph.getDeploys({ names })

    // Filter out actions with removeOnCleanup = false, unless force is set
    if (!force) {
      const skippedDeploys = deploys.filter((a) => a.getConfig("removeOnCleanup") === false)
      if (skippedDeploys.length > 0) {
        servicesLog.info(
          `Skipping cleanup for ${skippedDeploys.map((a) => a.name).join(", ")} (removeOnCleanup = false)`
        )
        deploys = deploys.filter((a) => a.getConfig("removeOnCleanup") !== false)
      }
    }

    const tasks = deploys.map((action) => {
      return new DeleteDeployTask({
        garden: this.garden,
        graph,
        action,
        log: servicesLog,
        dependantsFirst,
        deleteDeployNames: deploys.map((d) => d.name),
        force: false,
        forceActions: [],
      })
    })

    const { results } = await this.garden.processTasks({ tasks, throwOnError: true })

    const serviceStatuses = deletedDeployStatuses(results)

    servicesLog.success("Done")

    return serviceStatuses
  }
}
