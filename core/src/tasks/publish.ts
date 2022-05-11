/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BuildTask } from "./build"
import { GardenModule } from "../types/module"
import { PublishModuleResult } from "../types/plugin/module/publishModule"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ConfigGraph } from "../config-graph"
import { emptyRuntimeContext } from "../runtime-context"
import { resolveTemplateString } from "../template-string/template-string"
import { joi } from "../config/common"
import { versionStringPrefix } from "../vcs/vcs"
import { ConfigContext, schema } from "../config/template-contexts/base"
import { ModuleConfigContext, ModuleConfigContextParams } from "../config/template-contexts/module"

export interface PublishTaskParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  module: GardenModule
  forceBuild: boolean
  tagTemplate?: string
}

export class PublishTask extends BaseTask {
  type: TaskType = "publish"
  concurrencyLimit = 5

  graph: ConfigGraph
  module: GardenModule
  forceBuild: boolean
  tagTemplate?: string

  constructor({ garden, graph, log, module, forceBuild, tagTemplate }: PublishTaskParams) {
    super({ garden, log, version: module.version.versionString })
    this.graph = graph
    this.module = module
    this.forceBuild = forceBuild
    this.tagTemplate = tagTemplate
    this.validate()
  }

  async resolveDependencies() {
    if (!this.module.allowPublish) {
      return []
    }
    return BuildTask.factory({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      module: this.module,
      force: this.forceBuild,
    })
  }

  getName() {
    return this.module.name
  }

  getDescription() {
    return `publishing module ${this.module.name}`
  }

  async process(): Promise<PublishModuleResult> {
    const module = this.module

    if (!module.allowPublish) {
      this.log.info({
        section: module.name,
        msg: "Publishing disabled (allowPublish=false set on module)",
        status: "active",
      })
      return { published: false }
    }

    let tag: string | undefined = undefined

    if (this.tagTemplate) {
      const resolvedProviders = await this.garden.resolveProviders(this.log)
      const dependencies = Object.values(module.buildDependencies)

      const templateContext = new ModuleTagContext({
        garden: this.garden,
        moduleConfig: module,
        variables: { ...this.garden.variables, ...module.variables },
        resolvedProviders,
        module,
        buildPath: module.buildPath,
        modules: dependencies,
        runtimeContext: emptyRuntimeContext,
        partialRuntimeResolution: true,
      })

      // Resolve template string and make sure the result is a string
      tag = "" + resolveTemplateString(this.tagTemplate, templateContext)

      // TODO: validate the tag?
    }

    const log = this.log.info({
      section: module.name,
      msg: "Publishing with tag " + tag,
      status: "active",
    })

    const actions = await this.garden.getActionRouter()

    let result: PublishModuleResult
    try {
      result = await actions.publishModule({ module, log, graph: this.graph, tag })
    } catch (err) {
      log.setError()
      throw err
    }

    if (result.published) {
      log.setSuccess({
        msg: chalk.green(result.message || `Ready`),
        append: true,
      })
    } else {
      log.setWarn({ msg: result.message, append: true })
    }

    return result
  }
}

class ModuleSelfContext extends ConfigContext {
  @schema(joi.string().description("The name of the module being tagged."))
  public name: string

  @schema(joi.string().description("The version of the module being tagged (including the 'v-' prefix)."))
  public version: string

  @schema(joi.string().description("The version hash of the module being tagged (minus the 'v-' prefix)."))
  public hash: string

  constructor(parent: ConfigContext, module: GardenModule) {
    super(parent)
    this.name = module.name
    this.version = module.version.versionString
    this.hash = module.version.versionString.slice(versionStringPrefix.length)
  }
}

class ModuleTagContext extends ModuleConfigContext {
  @schema(ModuleSelfContext.getSchema().description("Extended information about the module being tagged."))
  public module: ModuleSelfContext

  constructor(params: ModuleConfigContextParams & { module: GardenModule }) {
    super(params)
    this.module = new ModuleSelfContext(this, params.module)
  }
}
