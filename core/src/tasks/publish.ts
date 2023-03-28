/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildTask } from "./build"
import { ActionTaskProcessParams, BaseActionTask, BaseActionTaskParams } from "../tasks/base"
import { resolveTemplateString } from "../template-string/template-string"
import { joi } from "../config/common"
import { versionStringPrefix } from "../vcs/vcs"
import { ConfigContext, schema } from "../config/template-contexts/base"
import { PublishActionResult } from "../plugin/handlers/Build/publish"
import { BuildAction } from "../actions/build"
import { ActionSpecContext, ActionSpecContextParams } from "../config/template-contexts/actions"
import { ActionState } from "../actions/types"

export interface PublishTaskParams extends BaseActionTaskParams<BuildAction> {
  tagTemplate?: string
}

export class PublishTask extends BaseActionTask<BuildAction, PublishActionResult> {
  type = "publish"
  concurrencyLimit = 5

  tagTemplate?: string

  constructor(params: PublishTaskParams) {
    super(params)
    this.tagTemplate = params.tagTemplate
  }

  resolveStatusDependencies() {
    return []
  }

  resolveProcessDependencies() {
    if (this.action.getConfig("allowPublish") === false) {
      return [this.getResolveTask(this.action)]
    }
    return [
      new BuildTask({
        ...this.getBaseDependencyParams(),
        action: this.action,
        force: !!this.forceActions.find((ref) => this.action.matchesRef(ref)),
      }),
    ]
  }

  getDescription() {
    return `publish ${this.action.longDescription()}`
  }

  async getStatus() {
    // TODO-G2
    return null
  }

  async process({ dependencyResults }: ActionTaskProcessParams<BuildAction, PublishActionResult>) {
    if (this.action.getConfig("allowPublish") === false) {
      this.log.info({
        section: this.action.key(),
        msg: "Publishing disabled (allowPublish=false set on build)",
      })
      return {
        state: <ActionState>"ready",
        detail: { published: false },
        outputs: {},
        version: this.getResolvedAction(this.action, dependencyResults).versionString(),
      }
    }

    const action = this.getExecutedAction(this.action, dependencyResults)
    const version = action.versionString()

    let tag = version

    if (this.tagTemplate) {
      const resolvedProviders = await this.garden.resolveProviders(this.log)

      const templateContext = new BuildTagContext({
        garden: this.garden,
        action,
        resolvedProviders,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        resolvedDependencies: action.getResolvedDependencies(),
        executedDependencies: action.getExecutedDependencies(),
        inputs: action.getInternal().inputs || {},
        variables: action.getVariables(),
      })

      // Resolve template string and make sure the result is a string
      tag = "" + resolveTemplateString(this.tagTemplate, templateContext)

      // TODO: validate the tag?
    }

    const log = this.log.createLog().info("Publishing with tag " + tag)

    const router = await this.garden.getActionRouter()

    let result: PublishActionResult
    try {
      const output = await router.build.publish({ action, log, graph: this.graph, tag })
      result = output.result
    } catch (err) {
      log.error(`Failed publishing build ${action.name}`)
      throw err
    }

    if (result.detail?.published) {
      log.success(result.detail.message || `Ready`)
    } else if (result.detail?.message) {
      log.warn(result.detail.message)
    }

    return { ...result, version }
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

class BuildTagContext extends ActionSpecContext {
  @schema(BuildSelfContext.getSchema().description("Extended information about the build being tagged."))
  public build: BuildSelfContext

  @schema(BuildSelfContext.getSchema().description("Alias kept for compatibility."))
  public module: BuildSelfContext

  constructor(params: ActionSpecContextParams & { action: BuildAction }) {
    super(params)
    this.build = this.module = new BuildSelfContext(this, params.action)
  }
}
