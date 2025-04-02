/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { EnvironmentParameter } from "../cli/params.js"
import { dedent } from "../util/string.js"
import type { CommandParams } from "./base.js"
import { Command, CommandGroup } from "./base.js"
import { ConfigurationError } from "../exceptions.js"
import { styles } from "../logger/styles.js"

export class SetCommand extends CommandGroup {
  name = "set"
  help = "Set or modify data and configuration values."
  override hidden = true

  subCommands = [SetDefaultEnvCommand]
}

const setDefaultEnvArgs = {
  env: new EnvironmentParameter({
    help: "The default environment to set for the current project",
    required: false,
  }),
}

type SetDefaultEnvArgs = typeof setDefaultEnvArgs

export class SetDefaultEnvCommand extends Command<SetDefaultEnvArgs, {}> {
  name = "default-env"

  help = "Locally override the default environment for the project."
  override hidden = true

  override description = dedent`
    Override the default environment for the project for this working copy.

    Examples:

      garden set default-env remote       # Set the default env to remote (with the configured default namespace)
      garden set default-env dev.my-env   # Set the default env to dev.my-env
      garden set default-env              # Clear any previously set override
  `

  override arguments = setDefaultEnvArgs

  async action({ garden, log, args }: CommandParams<SetDefaultEnvArgs, {}>) {
    if (args.env) {
      // check if the specified env is a valid environment.
      const availableEnvironments = garden.getProjectConfig().environments
      if (!availableEnvironments.find((e) => e.name === args.env)) {
        throw new ConfigurationError({
          message: `Invalid environment ${
            args.env
          } specified as argument. Available environments: ${availableEnvironments.map((a) => a.name).join(", ")}.`,
        })
      }
    }

    await garden.localConfigStore.set("defaultEnv", args.env || "")
    log.info("")

    if (args.env) {
      log.success(`Set the default environment to ${styles.highlight(args.env)}`)
    } else {
      log.success("Cleared the default environment")
    }

    return {}
  }
}
