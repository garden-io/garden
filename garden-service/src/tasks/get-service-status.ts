/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
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
import { getTaskVersion, TaskTask } from "./task"
import Bluebird from "bluebird"
import { StageBuildTask } from "./stage-build"

export interface GetServiceStatusTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: Service
  force: boolean
  log: LogEntry
  hotReloadServiceNames?: string[]
}

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

    const stageBuildTask = new StageBuildTask({
      garden: this.garden,
      log: this.log,
      module: this.service.module,
      force: this.force,
    })

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

    const taskTasks = await Bluebird.map(deps.run, async (task) => {
      return new TaskTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        task,
        force: false,
        forceBuild: false,
        version: await getTaskVersion(this.garden, this.graph, task),
      })
    })

    return [stageBuildTask, ...statusTasks, ...taskTasks]
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
      module: this.service.module,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let status = await actions.getServiceStatus({
      service: this.service,
      log,
      hotReload,
      runtimeContext,
    })

    return status
  }
}
