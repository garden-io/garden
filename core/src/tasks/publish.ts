/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildTask } from "./build.js"
import type { BaseActionTaskParams, ActionTaskProcessParams } from "../tasks/base.js"
import { BaseActionTask } from "../tasks/base.js"
import { legacyResolveTemplateString } from "../template/templated-strings.js"
import { joi } from "../config/common.js"
import { versionStringPrefix } from "../vcs/vcs.js"
import { ContextWithSchema, schema } from "../config/template-contexts/base.js"
import type { PublishActionResult } from "../plugin/handlers/Build/publish.js"
import type { BuildAction } from "../actions/build.js"
import type { ActionSpecContextParams } from "../config/template-contexts/actions.js"
import { ActionSpecContext } from "../config/template-contexts/actions.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { InputContext } from "../config/template-contexts/input.js"
import type { Log } from "../logger/log-entry.js"

export interface PublishTaskParams extends BaseActionTaskParams<BuildAction> {
  /**
   * Only defined if --tag option is used in the garden publish command.
   */
  tagOverrideTemplate?: string
}

export class PublishTask extends BaseActionTask<BuildAction, PublishActionResult> {
  readonly type = "publish"
  override readonly executeConcurrencyLimit = 5
  override readonly statusConcurrencyLimit = 5

  /**
   * Only defined if --tag option is used in the garden publish command.
   */
  tagOverrideTemplate?: string

  constructor(params: PublishTaskParams) {
    super(params)
    this.tagOverrideTemplate = params.tagOverrideTemplate
  }

  protected override getDependencyParams(): PublishTaskParams {
    return { ...super.getDependencyParams(), tagOverrideTemplate: this.tagOverrideTemplate }
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
        version: this.getResolvedAction(this.action, dependencyResults).versionString(this.log),
      }
    }

    const action = this.getExecutedAction(this.action, dependencyResults)
    const log = this.log.createLog()
    const version = action.versionString(log)

    // This is only defined when a user defines --tag option
    let tagOverride: string | undefined = undefined

    if (this.tagOverrideTemplate) {
      const resolvedProviders = await this.garden.resolveProviders({ log: this.log })

      const templateContext = new BuildTagContext({
        garden: this.garden,
        action,
        resolvedProviders,
        modules: this.graph.getModules(),
        resolvedDependencies: action.getResolvedDependencies(),
        executedDependencies: action.getExecutedDependencies(),
        inputs: new InputContext(action.getInternal().inputs),
        variables: action.getVariablesContext(),
      })

      // Resolve template string and make sure the result is a string
      tagOverride = "" + legacyResolveTemplateString({ string: this.tagOverrideTemplate, context: templateContext })

      // TODO: validate the tag?
    }

    if (tagOverride) {
      this.log.info(`Publish tag has been overridden with the --tag command line option: ${tagOverride}`)
    }

    const router = await this.garden.getActionRouter()

    let result: PublishActionResult
    try {
      const output = await router.build.publish({ action, log: this.log, graph: this.graph, tagOverride })
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

class BuildSelfContext extends ContextWithSchema {
  @schema(joi.string().description("The name of the build being tagged."))
  public readonly name: string

  @schema(joi.string().description("The version of the build being tagged (including the 'v-' prefix)."))
  public readonly version: string

  @schema(joi.string().description("The version hash of the build being tagged (minus the 'v-' prefix)."))
  public readonly hash: string

  constructor(build: BuildAction, log: Log) {
    super()
    this.name = build.name
    this.version = build.versionString(log)
    this.hash = this.version.slice(versionStringPrefix.length)
  }
}

class BuildTagContext extends ActionSpecContext {
  @schema(BuildSelfContext.getSchema().description("Extended information about the build being tagged."))
  public readonly build: BuildSelfContext

  @schema(BuildSelfContext.getSchema().description("Alias kept for compatibility."))
  public readonly module: BuildSelfContext

  constructor(params: ActionSpecContextParams & { action: BuildAction }) {
    super(params)
    this.build = this.module = new BuildSelfContext(params.action, params.garden.log)
  }
}
