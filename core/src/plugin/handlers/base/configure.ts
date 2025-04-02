/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { PluginActionContextParams } from "../../../plugin/base.js"
import { logEntrySchema } from "../../../plugin/base.js"
import { joi } from "../../../config/common.js"
import type { Log } from "../../../logger/log-entry.js"
import type { ActionModes, BaseActionConfig } from "../../../actions/types.js"
import { ActionTypeHandlerSpec } from "./base.js"
import { pluginContextSchema } from "../../../plugin-context.js"
import { noTemplateFields } from "../../../config/base.js"

interface ConfigureActionConfigParams<T extends BaseActionConfig> extends PluginActionContextParams {
  log: Log
  config: T
}

export interface ConfigureActionConfigResult<T extends BaseActionConfig> {
  config: T
  supportedModes: ActionModes
}

export class ConfigureActionConfig<T extends BaseActionConfig = BaseActionConfig> extends ActionTypeHandlerSpec<
  any,
  ConfigureActionConfigParams<T>,
  ConfigureActionConfigResult<T>
> {
  description = dedent`
    Apply transformation to the given action configuration, at resolution time. Should also indicate whether the resulting action supports sync or local modes.

    Be aware that the \`spec\` and \`variables\` fields on the action config will *not* be fully resolved when passed to this handler, so referencing those fields in the handler must be done with care.

    The returned config may include template strings that reference fields in ActionConfigContext, but may presently not reference outputs from other actions.

    The following fields cannot be modified: ${noTemplateFields.join(", ")}

    This handler is called frequently, so it should generally return quickly and avoid doing any network calls or expensive computation.
  `

  paramsSchema = () =>
    joi.object().keys({
      ctx: pluginContextSchema().required(),
      log: logEntrySchema(),
      config: joi
        .any() // we control the handler calls, so we don't need joi to validate the parameters
        .required()
        .description(
          "The config for the action, with all built-in fields fully resolved, and the `spec` field partially resolved (excluding references to other actions)."
        ),
    })

  resultSchema = () =>
    joi.object().keys({
      config: joi.any().required(), // We will validate the action config again in preprocess action config, this is a performance optimisation
      supportedModes: joi
        .object()
        .keys({
          local: joi.boolean(),
          sync: joi.boolean(),
        })
        .description("Indicate which modes (e.g. sync or local) the action may be run in.")
        .required(),
    })
}
