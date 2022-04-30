/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType } from "./base"
import { GardenService, ServiceStatus } from "../types/service"
import { Garden } from "../garden"
import { ConfigGraph } from "../graph/config-graph"
import { GraphResults, GraphResult } from "../task-graph"
import { StageBuildTask } from "./stage-build"

export interface DeleteServiceTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: GardenService
  log: LogEntry
  /**
   * If true, the task will include delete service tasks for its dependants in its list of dependencies.
   */
  dependantsFirst?: boolean
  /**
   * If not provided, defaults to just `[service.name]`.
   */
  deleteServiceNames?: string[]
}

export class DeleteServiceTask extends BaseTask {
  type: TaskType = "delete-service"
  concurrencyLimit = 10
  graph: ConfigGraph
  service: GardenService
  dependantsFirst: boolean
  deleteServiceNames: string[]

  constructor({ garden, graph, log, service, deleteServiceNames, dependantsFirst = false }: DeleteServiceTaskParams) {
    super({ garden, log, force: false, version: service.version })
    this.graph = graph
    this.service = service
    this.dependantsFirst = dependantsFirst
    this.deleteServiceNames = deleteServiceNames || [service.name]
  }

  async resolveDependencies() {
    const stageBuildTask = new StageBuildTask({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      module: this.service.module,
      force: this.force,
    })

    if (!this.dependantsFirst) {
      return [stageBuildTask]
    }

    // Note: We delete in _reverse_ dependency order, so we query for dependants
    const deps = this.graph.getDependants({
      nodeType: "deploy",
      name: this.getName(),
      recursive: false,
      filter: (depNode) => depNode.type === "deploy" && this.deleteServiceNames.includes(depNode.name),
    })

    const dependants = deps.deploy.map((service) => {
      return new DeleteServiceTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        service,
        deleteServiceNames: this.deleteServiceNames,
        dependantsFirst: true,
      })
    })

    return [stageBuildTask, ...dependants]
  }

  getName() {
    return this.service.name
  }

  getDescription() {
    return `deleting service '${this.service.name}' (from module '${this.service.module.name}')`
  }

  async process(): Promise<ServiceStatus> {
    const actions = await this.garden.getActionRouter()
    let status: ServiceStatus

    try {
      status = await actions.deploy.delete({ log: this.log, service: this.service, graph: this.graph })
    } catch (err) {
      this.log.setError()
      throw err
    }

    return status
  }
}

export function deletedServiceStatuses(results: GraphResults): { [serviceName: string]: ServiceStatus } {
  const deleted = <GraphResult[]>Object.values(results).filter((r) => r && r.type === "delete-service")
  const statuses = {}

  for (const res of deleted) {
    statuses[res.name] = res.output
  }

  return statuses
}
