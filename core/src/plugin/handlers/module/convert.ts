/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { PluginContext, pluginContextSchema } from "../../../plugin-context"
import { logEntrySchema, PluginActionContextParams } from "../../base"
import { baseModuleSpecSchema, ModuleSpec } from "../../../config/module"
import { joi, joiIdentifier, joiStringMap } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"
import { BaseActionSpec, baseActionSpec } from "../../../actions/base"

export interface ConvertModuleParams<T extends ModuleSpec = ModuleSpec> extends PluginActionContextParams {
  ctx: PluginContext
  log: LogEntry
  moduleSpec: T
}

export interface ConvertModuleResult {
  actions: BaseActionSpec[]
  moduleOutputKeyMapping?: { [key: string]: string[] }
}

export const convertModule = () => ({
  description: dedent`
    Validate and convert the given module configuration to its atomic _action_ components (i.e. Build, Deploy, Run and Test). This is to allow backwards-compatibility from the Module configuration format to the newer action-oriented configuration style.

    Note that this does not need to perform structural schema validation (the framework does that automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    If the converted module type had output keys, those need to be declared in the \`moduleOutputKeyMapping\` key, which is an object whose keys are the module's output keys (as previously returned by the \`getModuleOutputs\` handler), and the values are the corresponding action output reference, as a tuple of identifiers (e.g. \`["build", "converted-build-name", "outputs", "some-key"]\`). This is used to make module output references backwards-compatible.

    This handler is called on every resolution of the project graph, so it should return quickly and avoid doing any network calls.
  `,

  paramsSchema: joi.object().keys({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema(),
    moduleSpec: baseModuleSpecSchema().required(),
  }),

  resultSchema: joi.object().keys({
    actions: joi.array().items(baseActionSpec()).required(),
    moduleOutputKeyMapping: joiStringMap(joi.array().items(joiIdentifier()).required()),
  }),
})
