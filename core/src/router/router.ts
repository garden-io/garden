/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

import type { Garden } from "../garden"
import type { LogEntry } from "../logger/log-entry"
import { GardenPlugin, ModuleTypeDefinition, PluginActionContextParams } from "../plugin/plugin"
import { getServiceStatuses } from "../tasks/helpers"
import { DeleteDeployTask, deletedDeployStatuses } from "../tasks/delete-deploy"
import { DeployTask } from "../tasks/deploy"
import { Profile } from "../util/profiling"
import type { ConfigGraph } from "../graph/config-graph"
import { ProviderRouter } from "./provider"
import { ActionKindRouter, BaseRouter, WrappedActionRouterHandlers } from "./base"
import { ModuleRouter } from "./module"
import { buildRouter } from "./build"
import { deployRouter } from "./deploy"
import { runRouter } from "./run"
import { testRouter } from "./test"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import type { GetActionOutputsParams, GetActionOutputsResult } from "../plugin/handlers/base/get-outputs"
import type { ActionKind, BaseActionConfig, ResolvedAction } from "../actions/types"

export interface DeployManyParams {
  graph: ConfigGraph
  log: LogEntry
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
    configuredPlugins: GardenPlugin[],
    loadedPlugins: GardenPlugin[],
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

    garden.log.silly(`Creating ActionRouter with ${configuredPlugins.length} configured providers`)
  }

  //===========================================================================
  //region Helper Methods
  //===========================================================================

  getRouterForActionKind<K extends ActionKind>(kind: K): ActionKindRouter<K> {
    return this[kind.toLowerCase()]
  }

  async configureAction<K extends ActionKind>({ config, log }: { config: BaseActionConfig<K>; log: LogEntry }) {
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

    return router.callHandler({
      handlerType: "getOutputs",
      // TODO-G2: figure out why the typing clashes here
      params: { ...params, action: <any>params.action, events: undefined },
      defaultHandler: async ({}) => ({ outputs: {} }),
    })
  }

  async getDeployStatuses({
    log,
    graph,
    names,
  }: {
    log: LogEntry
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
          devModeDeployNames: [],
          localModeDeployNames: [],
          forceActions: [],
          fromWatch: false,
        })
    )
    const { results } = await this.garden.processTasks({ tasks, log, throwOnError: true, statusOnly: true })

    return getServiceStatuses(results)
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
          fromWatch: false,
          devModeDeployNames: [],
          localModeDeployNames: [],
        })
    )

    return this.garden.processTasks({ tasks, log })
  }

  /**
   * Deletes all or specified deployments in the environment.
   */
  async deleteDeploys({
    graph,
    log,
    names,
    dependantsFirst,
  }: {
    graph: ConfigGraph
    log: LogEntry
    dependantsFirst?: boolean
    names?: string[]
  }) {
    const servicesLog = log.info({ msg: chalk.white("Deleting deployments..."), status: "active" })

    const deploys = graph.getDeploys({ names })

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
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })
    })

    const { results } = await this.garden.processTasks({ tasks, log, throwOnError: true })

    const serviceStatuses = deletedDeployStatuses(results)

    servicesLog.setSuccess()

    return serviceStatuses
  }
}
