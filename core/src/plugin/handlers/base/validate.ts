/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { pluginContextSchema } from "../../../plugin-context"
import { logEntrySchema, PluginActionContextParams } from "../../../plugin/base"
import { joi } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"
import { baseActionConfig, BaseActionConfig } from "../../../actions/base"
import { ActionTypeHandlerSpec } from "./base"

interface ValidateActionParams<T extends BaseActionConfig> extends PluginActionContextParams {
  log: LogEntry
  spec: T
}

interface ValidateActionResult<T extends BaseActionConfig> {
  spec: T
}

export class ValidateAction<T extends BaseActionConfig = BaseActionConfig> extends ActionTypeHandlerSpec<
  any,
  ValidateActionParams<T>,
  ValidateActionResult<T>
> {
  description = dedent`
    Validate and (optionally) transform the given action spec.

    Note that this does not need to perform structural schema validation (the framework does that automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    This handler is called on every resolution of the project graph, so it should return quickly and avoid doing any network calls or expensive computation.
  `

  paramsSchema = () =>
    joi.object().keys({
      ctx: pluginContextSchema().required(),
      log: logEntrySchema(),
      spec: baseActionConfig().required(),
    })

  resultSchema = () =>
    joi.object().keys({
      spec: baseActionConfig().required(),
    })
}
