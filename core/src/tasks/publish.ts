/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BuildTask } from "./build"
import { BaseActionTask, BaseActionTaskParams, TaskType } from "../tasks/base"
import { emptyRuntimeContext } from "../runtime-context"
import { resolveTemplateString } from "../template-string/template-string"
import { joi } from "../config/common"
import { versionStringPrefix } from "../vcs/vcs"
import { ConfigContext, schema } from "../config/template-contexts/base"
import { ModuleConfigContext, ModuleConfigContextParams } from "../config/template-contexts/module"
import { PublishActionResult } from "../plugin/handlers/build/publish"
import { BuildAction } from "../actions/build"
import { ActionConfigContext, ActionConfigContextParams } from "../config/template-contexts/actions"

export interface PublishTaskParams extends BaseActionTaskParams<BuildAction> {
  forceBuild: boolean
  tagTemplate?: string
}

export class PublishTask extends BaseActionTask<BuildAction> {
  type: TaskType = "publish"
  concurrencyLimit = 5

  forceBuild: boolean
  tagTemplate?: string

  constructor(params: PublishTaskParams) {
    super(params)
    this.forceBuild = params.forceBuild
    this.tagTemplate = params.tagTemplate
  }

  async resolveDependencies() {
    if (this.action.getConfig("allowPublish") === false) {
      return []
    }
    return [
      new BuildTask({
        ...this.getBaseDependencyParams(),
        action: this.action,
        force: this.forceBuild,
      }),
    ]
  }

  getDescription() {
    return `publishing ${this.action.longDescription()}`
  }

  async process(_, resolvedAction): Promise<PublishActionResult> {
    const action = this.action

    if (!action.getConfig("allowPublish")) {
      this.log.info({
        section: action.key(),
        msg: "Publishing disabled (allowPublish=false set on module)",
        status: "active",
      })
      return { published: false }
    }

    let tag: string | undefined = undefined

    if (this.tagTemplate) {
      const resolvedProviders = await this.garden.resolveProviders(this.log)
      const dependencies = Object.values(module.buildDependencies)

      const templateContext = new BuildTagContext({
        garden: this.garden,
        action,
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
      section: action.key(),
      msg: "Publishing with tag " + tag,
      status: "active",
    })

    const router = await this.garden.getActionRouter()

    let result: PublishActionResult
    try {
      result = await router.build.publish({ action, log, graph: this.graph, tag })
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

class BuildSelfContext extends ConfigContext {
  @schema(joi.string().description("The name of the build being tagged."))
  public name: string

  @schema(joi.string().description("The version of the build being tagged (including the 'v-' prefix)."))
  public version: string

  @schema(joi.string().description("The version hash of the build being tagged (minus the 'v-' prefix)."))
  public hash: string

  constructor(parent: ConfigContext, build: BuildAction) {
    super(parent)
    this.name = build.name
    this.version = build.versionString()
    this.hash = this.version.slice(versionStringPrefix.length)
  }
}

class BuildTagContext extends ActionConfigContext {
  @schema(BuildSelfContext.getSchema().description("Extended information about the build being tagged."))
  public build: BuildSelfContext

  @schema(BuildSelfContext.getSchema().description("Alias kept for compatibility."))
  public module: BuildSelfContext

  constructor(params: ActionConfigContextParams & { build: BuildAction }) {
    super(params)
    this.build = this.module = new BuildSelfContext(this, params.build)
  }
}
