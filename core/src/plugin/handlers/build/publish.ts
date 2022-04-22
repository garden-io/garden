/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { actionParamsSchema, PluginBuildActionParamsBase } from "../../../plugin/base"
import { joi } from "../../../config/common"
import { BuildActionConfig } from "../../../actions/build"
import { ActionTypeHandlerSpec } from "../base/base"

interface PublishActionParams<T extends BuildActionConfig = BuildActionConfig> extends PluginBuildActionParamsBase<T> {
  tag?: string
}

export interface PublishActionResult {
  published: boolean
  message?: string
  identifier?: string
}

export const publishResultSchema = () =>
  joi.object().keys({
    published: joi.boolean().required().description("Set to true if the build was published."),
    message: joi.string().description("Optional result message from the provider."),
    identifier: joi.string().description("The published artifact identifier, if applicable."),
  })

export class PublishBuildAction<T extends BuildActionConfig = BuildActionConfig> extends ActionTypeHandlerSpec<
  "build",
  PublishActionParams<T>,
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
