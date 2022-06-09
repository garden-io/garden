/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults } from "./base"
import { GardenService, ServiceStatus } from "../types/service"
import { Garden } from "../garden"
import { ConfigGraph } from "../config-graph"
import { GraphResults } from "../task-graph"
import { prepareRuntimeContext } from "../runtime-context"
import Bluebird from "bluebird"
import { GetTaskResultTask } from "./get-task-result"
import chalk from "chalk"
import { Profile } from "../util/profiling"

export interface GetServiceStatusTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: GardenService
  force: boolean
  log: LogEntry
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
  localModeServiceNames: string[]
}

@Profile()
export class GetServiceStatusTask extends BaseTask {
  type: TaskType = "get-service-status"
  concurrencyLimit = 20
  graph: ConfigGraph
  service: GardenService
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
  localModeServiceNames: string[]

  constructor({
    garden,
    graph,
    log,
    service,
    force,
    devModeServiceNames,
    hotReloadServiceNames,
    localModeServiceNames,
  }: GetServiceStatusTaskParams) {
    super({ garden, log, force, version: service.version })
    this.graph = graph
    this.service = service
    this.devModeServiceNames = devModeServiceNames
    this.hotReloadServiceNames = hotReloadServiceNames
    this.localModeServiceNames = localModeServiceNames
  }

  async resolveDependencies() {
    const deps = this.graph.getDependencies({ nodeType: "deploy", name: this.getName(), recursive: false })

    const statusTasks = deps.deploy.map((service) => {
      return new GetServiceStatusTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        service,
        force: false,
        devModeServiceNames: this.devModeServiceNames,
        hotReloadServiceNames: this.hotReloadServiceNames,
        localModeServiceNames: this.localModeServiceNames,
      })
    })

    const taskResultTasks = await Bluebird.map(deps.run, async (task) => {
      return new GetTaskResultTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        task,
        force: false,
      })
    })

    return [...statusTasks, ...taskResultTasks]
  }

  getName() {
    return this.service.name
  }

  getDescription() {
    return `getting status for service '${this.service.name}' (from module '${this.service.module.name}')`
  }

  async process(dependencyResults: GraphResults): Promise<ServiceStatus> {
    const log = this.log.placeholder()

    const devMode = includes(this.devModeServiceNames, this.service.name)
    const hotReload = !devMode && includes(this.hotReloadServiceNames, this.service.name)
    const localMode = !devMode && includes(this.localModeServiceNames, this.service.name)

    const dependencies = this.graph.getDependencies({
      nodeType: "deploy",
      name: this.getName(),
      recursive: false,
    })

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version: this.version,
      moduleVersion: this.service.module.version.versionString,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let status: ServiceStatus = { state: "unknown", detail: {} }

    try {
      status = await actions.getServiceStatus({
        graph: this.graph,
        service: this.service,
        log,
        devMode,
        hotReload,
        localMode,
        runtimeContext,
      })
    } catch (err) {
      // This can come up if runtime outputs are not resolvable
      if (err.type === "template-string") {
        log.debug(`Unable to resolve status for service ${chalk.white(this.service.name)}: ${err.message}`)
      } else {
        throw err
      }
    }

    return status
  }
}
