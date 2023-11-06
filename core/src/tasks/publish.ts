/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildTask } from "./build.js"
import type { BaseActionTaskParams, ActionTaskProcessParams } from "../tasks/base.js"
import { BaseActionTask } from "../tasks/base.js"
import { resolveTemplateString } from "../template-string/template-string.js"
import { joi } from "../config/common.js"
import { versionStringPrefix } from "../vcs/vcs.js"
import { ConfigContext, schema } from "../config/template-contexts/base.js"
import type { PublishActionResult } from "../plugin/handlers/Build/publish.js"
import type { BuildAction } from "../actions/build.js"
import type { ActionSpecContextParams } from "../config/template-contexts/actions.js"
import { ActionSpecContext } from "../config/template-contexts/actions.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"

export interface PublishTaskParams extends BaseActionTaskParams<BuildAction> {
  tagTemplate?: string
}

export class PublishTask extends BaseActionTask<BuildAction, PublishActionResult> {
  type = "publish"
  override concurrencyLimit = 5

  tagTemplate?: string

  constructor(params: PublishTaskParams) {
    super(params)
    this.tagTemplate = params.tagTemplate
  }

  protected override getDependencyParams(): PublishTaskParams {
    return { ...super.getDependencyParams(), tagTemplate: this.tagTemplate }
  }

  override resolveStatusDependencies() {
    return []
  }

  override resolveProcessDependencies() {
    if (this.action.getConfig("allowPublish") === false) {
      return [this.getResolveTask(this.action)]
    }
    return [
      new BuildTask({
        ...this.getDependencyParams(),
        action: this.action,
        force: !!this.forceActions.find((ref) => this.action.matchesRef(ref)),
      }),
    ]
  }

  getDescription() {
    return `publish ${this.action.longDescription()}`
  }

  async getStatus() {
    // TODO-0.13.1
    return null
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.publish`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  async process({ dependencyResults }: ActionTaskProcessParams<BuildAction, PublishActionResult>) {
    if (this.action.getConfig("allowPublish") === false) {
      this.log.info("Publishing disabled (allowPublish=false set on build)")
      return {
        state: "ready" as const,
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
      tag = "" + resolveTemplateString({ string: this.tagTemplate, context: templateContext })

      // TODO: validate the tag?
    }

    this.log.info("Publishing with tag " + tag)

    const router = await this.garden.getActionRouter()

    let result: PublishActionResult
    try {
      const output = await router.build.publish({ action, log: this.log, graph: this.graph, tag })
      result = output.result
    } catch (err) {
      this.log.error(`Failed publishing build ${action.name}`)
      throw err
    }

    if (result.detail?.published) {
      this.log.success(result.detail.message || `Ready`)
    } else if (result.detail?.message) {
      this.log.warn(result.detail.message)
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
