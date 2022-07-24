/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { logEntrySchema, PluginActionContextParams } from "../../../plugin/base"
import { joi } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"
import { baseActionConfigSchema, BaseActionConfig } from "../../../actions/base"
import { ActionTypeHandlerSpec } from "./base"
import { pluginContextSchema } from "../../../plugin-context"
import { noTemplateFields } from "../../../config/base"

interface ConfigureActionConfigParams<T extends BaseActionConfig> extends PluginActionContextParams {
  log: LogEntry
  config: T
  // dependencies: BaseActionConfig[]
}

export interface ConfigureActionConfigResult<T extends BaseActionConfig> {
  config: T
}

// TODO-G2: maybe rename to transform?
export class ConfigureActionConfig<T extends BaseActionConfig = BaseActionConfig> extends ActionTypeHandlerSpec<
  any,
  ConfigureActionConfigParams<T>,
  ConfigureActionConfigResult<T>
> {
  description = dedent`
    Apply transformation to the given action configuration, at resolution time.

    Be aware that the \`spec\` and \`variables\` fields on the action config will *not* be fully resolved when passed to this handler, so referencing those fields in the handler must be done with care.

    The returned config may include template strings that reference fields in ActionConfigContext, but may presently not reference outputs from other actions.

    The following fields cannot be modified: ${noTemplateFields.join(", ")}

    This handler is called frequently, so it should generally return quickly and avoid doing any network calls or expensive computation.
  `

  paramsSchema = () =>
    joi.object().keys({
      ctx: pluginContextSchema().required(),
      log: logEntrySchema(),
      config: baseActionConfigSchema()
        .required()
        .description(
          "The config for the action, with all built-in fields fully resolved, and the `spec` field partially resolved (excluding references to other actions)."
        ),
      // dependencies: joi
      //   .object()
      //   .pattern(identifierRegex, baseActionConfigSchema())
      //   .description(
      //     "A list of configs for every dependency of this action, transitively (i.e. including dependencies of dependencies etc.)."
      //   ),
    })

  resultSchema = () =>
    joi.object().keys({
      config: baseActionConfigSchema(),
    })
}
