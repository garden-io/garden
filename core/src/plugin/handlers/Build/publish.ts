/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { PluginBuildActionParamsBase } from "../../../plugin/base.js"
import { actionParamsSchema } from "../../../plugin/base.js"
import { createSchema, joi } from "../../../config/common.js"
import type { BuildAction } from "../../../actions/build.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { ActionStatus, Executed } from "../../../actions/types.js"
import { actionStatusSchema } from "../../../actions/base.js"

interface PublishActionParams<T extends BuildAction = BuildAction> extends PluginBuildActionParamsBase<T> {
  /**
   * This is only defined when a user defines --tag option.
   */
  tagOverride?: string
}

export type PublishActionDetail = {
  published: boolean
  message?: string
  identifier?: string
}

export type PublishActionResult = ActionStatus<BuildAction, PublishActionDetail>

export const publishResultSchema = createSchema({
  name: "publish-result",
  extend: actionStatusSchema,
  keys: () => ({
    detail: joi.object().keys({
      published: joi.boolean().required().description("Set to true if the build was published."),
      message: joi.string().description("Optional result message from the provider."),
      identifier: joi.string().description("The published artifact identifier, if applicable."),
    }),
  }),
})

export class PublishBuildAction<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "Build",
  PublishActionParams<Executed<T>>,
  PublishActionResult
> {
  description = dedent`
    Publish a built artifact (e.g. a container image) to a remote registry.

    Called by the \`garden publish\` command.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      tag: joi.string().description("A specific tag to apply when publishing the artifact, instead of the default."),
    })

  resultSchema = () => publishResultSchema()
}
