/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults } from "./base"
import { Service, ServiceStatus } from "../types/service"
import { Garden } from "../garden"
import { ConfigGraph } from "../config-graph"
import { TaskResults } from "../task-graph"
import { prepareRuntimeContext } from "../runtime-context"
import { getTaskVersion } from "./task"
import Bluebird from "bluebird"
import { GetTaskResultTask } from "./get-task-result"
import chalk from "chalk"
import { Profile } from "../util/profiling"

export interface GetServiceStatusTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: Service
  force: boolean
  log: LogEntry
  hotReloadServiceNames?: string[]
}

@Profile()
export class GetServiceStatusTask extends BaseTask {
  type: TaskType = "get-service-status"

  private graph: ConfigGraph
  private service: Service
  private hotReloadServiceNames: string[]

  constructor({ garden, graph, log, service, force, hotReloadServiceNames = [] }: GetServiceStatusTaskParams) {
    super({ garden, log, force, version: service.module.version })
    this.graph = graph
    this.service = service
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async getDependencies() {
    const deps = await this.graph.getDependencies({ nodeType: "deploy", name: this.getName(), recursive: false })

    const statusTasks = deps.deploy.map((service) => {
      return new GetServiceStatusTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        service,
        force: false,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })
    })

    const taskResultTasks = await Bluebird.map(deps.run, async (task) => {
      return new GetTaskResultTask({
        garden: this.garden,
        log: this.log,
        task,
        force: false,
        version: await getTaskVersion(this.garden, this.graph, task),
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

  async process(dependencyResults: TaskResults): Promise<ServiceStatus> {
    const log = this.log.placeholder()

    const hotReload = includes(this.hotReloadServiceNames, this.service.name)

    const dependencies = await this.graph.getDependencies({
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
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let status: ServiceStatus = { state: "unknown", detail: {} }

    try {
      status = await actions.getServiceStatus({
        service: this.service,
        log,
        hotReload,
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
