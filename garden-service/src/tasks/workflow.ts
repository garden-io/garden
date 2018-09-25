/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Task } from "../tasks/base"
import { Garden } from "../garden"
import { Workflow } from "../types/workflow"
import { BuildTask } from "./build"
import { DeployTask } from "./deploy"
import { LogEntry } from "../logger/log-entry"
import { RunWorkflowResult } from "../types/plugin/outputs"
import { prepareRuntimeContext } from "../types/service"
import { DependencyGraphNodeType } from "../dependency-graph"

export interface WorkflowTaskParams {
  garden: Garden
  workflow: Workflow
  force: boolean
  forceBuild: boolean
  logEntry?: LogEntry
}

export class WorkflowTask extends Task {
  type = "workflow"
  depType: DependencyGraphNodeType = "workflow"

  private workflow: Workflow
  private forceBuild: boolean

  constructor({ garden, workflow, force, forceBuild }: WorkflowTaskParams) {
    super({ garden, force, version: workflow.module.version })
    this.workflow = workflow
    this.forceBuild = forceBuild
  }

  async getDependencies(): Promise<Task[]> {

    const buildTask = new BuildTask({
      garden: this.garden,
      module: this.workflow.module,
      force: this.forceBuild,
    })

    const dg = await this.garden.getDependencyGraph()
    const deps = await dg.getDependencies(this.depType, this.getName(), false)

    const deployTasks = deps.service.map(service => {
      return new DeployTask({
        service,
        garden: this.garden,
        force: false,
        forceBuild: false,
      })
    })

    const workflowTasks = deps.workflow.map(workflow => {
      return new WorkflowTask({
        workflow,
        garden: this.garden,
        force: false,
        forceBuild: false,
      })
    })

    return [buildTask, ...deployTasks, ...workflowTasks]

  }

  protected getName() {
    return this.workflow.name
  }

  getDescription() {
    return `running task ${this.workflow.name} in module ${this.workflow.module.name}`
  }

  async process() {

    const workflow = this.workflow
    const module = workflow.module

    // combine all dependencies for all services in the module, to be sure we have all the context we need
    const dg = await this.garden.getDependencyGraph()
    const serviceDeps = (await dg.getDependencies(this.depType, this.getName(), false)).service
    const runtimeContext = await prepareRuntimeContext(this.garden, module, serviceDeps)

    const logEntry = this.garden.log.info({
      section: workflow.name,
      msg: "Running",
      status: "active",
    })

    let result: RunWorkflowResult
    try {
      result = await this.garden.actions.runWorkflow({
        workflow,
        logEntry,
        runtimeContext,
        interactive: false,
      })
    } catch (err) {
      logEntry.setError()
      throw err
    }

    logEntry.setSuccess({ msg: chalk.green(`Done (took ${logEntry.getDuration(1)} sec)`), append: true })

    return result

  }

}
