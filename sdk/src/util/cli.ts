/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ParameterObject } from "@garden-io/core/build/src/cli/params.js"
import { prepareMinimistOpts } from "@garden-io/core/build/src/cli/helpers.js"
import minimist from "minimist"

export {
  BooleanParameter,
  ChoicesParameter,
  DurationParameter,
  IntegerParameter,
  PathParameter,
  PathsParameter,
  StringOption,
  StringsParameter,
  TagsOption,
} from "@garden-io/core/build/src/cli/params.js"

/**
 * Parses the given CLI arguments using minimist, according to the CLI options spec provided. Useful for plugin commands
 * that want to support CLI options.
 *
 * @param stringArgs  Raw string arguments
 * @param optionSpec  A map of CLI options that should be detected and parsed.
 * @param cli         If true, prefer `option.cliDefault` to `option.defaultValue`.
 * @param skipDefault Defaults to `false`. If `true`, don't populate default values.
 */
export function parsePluginCommandArgs(params: {
  stringArgs: string[]
  optionSpec: ParameterObject
  cli: boolean
  skipDefault?: boolean
}) {
  const { stringArgs, optionSpec } = params
  const minimistOpts = prepareMinimistOpts({
    options: optionSpec,
    ...params,
  })

  const parsed = minimist(stringArgs, {
    ...minimistOpts,
    "--": true,
  })

  return {
    args: parsed["_"],
    opts: parsed,
  }
}
