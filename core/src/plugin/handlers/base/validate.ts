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
import { identifierRegex, joi } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"
import { baseActionConfig, BaseActionConfig } from "../../../actions/base"
import { ActionTypeHandlerSpec } from "./base"

interface ValidateActionConfigParams<T extends BaseActionConfig> extends PluginActionContextParams {
  log: LogEntry
  config: T
  dependencies: BaseActionConfig[]
}

interface ValidateActionConfigResult<T extends BaseActionConfig> {
  spec: T["spec"]
}

export class ValidateActionConfig<T extends BaseActionConfig = BaseActionConfig> extends ActionTypeHandlerSpec<
  any,
  ValidateActionConfigParams<T>,
  ValidateActionConfigResult<T>
> {
  description = dedent`
    Validate the given action configuration, and optionally transform parts of it.

    When passed to this handler, be aware that the \`spec\` field will *not* be fully resolved, so validation on that field may not be advisable at this stage. Specifically, references to other actions (e.g. runtime outputs) will be resolved later.

    This does not need to perform structural schema validation (the framework does that automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    This handler is called on every resolution of the project graph, so it should return quickly and avoid doing any network calls or expensive computation.
  `

  paramsSchema = () =>
    joi.object().keys({
      ctx: pluginContextSchema().required(),
      log: logEntrySchema(),
      config: baseActionConfig()
        .required()
        .description(
          "The config for the action, with all built-in fields fully resolved, and the `spec` field partially resolved (excluding references to other actions)."
        ),
      dependencies: joi
        .object()
        .pattern(identifierRegex, baseActionConfig())
        .description(
          "A list of configs for every dependency of this action, transitively (i.e. including dependencies of dependencies etc.)."
        ),
    })

  resultSchema = () =>
    joi.object().keys({
      spec: joi.object(),
    })
}
