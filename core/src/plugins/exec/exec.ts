/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "../../config/common.js"
import { dedent } from "../../util/string.js"
import { runScript } from "../../util/util.js"
import { ChildProcessError, RuntimeError } from "../../exceptions.js"
import type { BaseProviderConfig, Provider } from "../../config/provider.js"
import { configureExecModule, execModuleSpecSchema } from "./moduleConfig.js"
import { convertExecModule } from "./convert.js"
import { sdk } from "../../plugin/sdk.js"

export type ExecProvider = Provider<ExecProviderOutputs>
export interface ExecProviderOutputs extends BaseProviderConfig {
  initScript: {
    log: string
  }
}

const s = sdk.schema

export const execPlugin = sdk.createGardenPlugin({
  name: "exec",
  docs: dedent`
      A simple provider that allows running arbitrary scripts when initializing providers, and provides the exec
      action type.

      _Note: This provider is always loaded when running Garden. You only need to explicitly declare it in your provider
      configuration if you want to configure a script for it to run._
    `,
  createModuleTypes: [
    {
      name: "exec",
      docs: dedent`
          A general-purpose module for executing commands in your shell. This can be a useful escape hatch if no other module type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

          By default, the \`exec\` module type executes the commands in the Garden build directory
          (under .garden/build/<module-name>). By setting \`local: true\`, the commands are executed in the module
          source directory instead.

          Note that Garden does not sync the source code for local exec modules into the Garden build directory.
          This means that include/exclude filters and ignore files are not applied to local exec modules, as the
          filtering is done during the sync.
        `,
      needsBuild: true,
      moduleOutputsSchema: joi.object().keys({}),
      schema: execModuleSpecSchema(),
      handlers: {
        configure: configureExecModule,
        convert: convertExecModule,
      },
    },
  ],
})

export const execProvider = execPlugin.createProvider({
  configSchema: s.object({
    initScript: s.string().optional().describe(dedent`
      An optional script to run in the project root when initializing providers. This is handy for running an arbitrary
      script when initializing. For example, another provider might declare a dependency on this provider, to ensure
      this script runs before resolving that provider.
    `),
  }),
  outputsSchema: s.object({
    initScript: s
      .object({
        log: s
          .string()
          .default("")
          .describe("The log output from the initScript specified in the provider configuration, if any."),
      })
      .optional(),
  }),
})

execProvider.addHandler("getEnvironmentStatus", async ({ ctx }) => {
  // Return ready if there is no initScript to run
  return { ready: !ctx.provider.config.initScript, outputs: {} }
})

execProvider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
  const execLog = log.createLog({ name: "exec" })

  if (!ctx.provider.config.initScript) {
    return { status: { ready: true, outputs: {} } }
  }

  try {
    execLog.info("Running init script")
    const result = await runScript({
      log: execLog,
      cwd: ctx.projectRoot,
      script: ctx.provider.config.initScript,
    })

    return { status: { ready: true, outputs: { initScript: { log: result.stdout.trim() } } } }
  } catch (err) {
    // Unexpected error (failed to execute script, as opposed to script returning an error code)
    if (!(err instanceof ChildProcessError)) {
      throw err
    }

    throw new RuntimeError({
      message: dedent`
          exec provider init script exited with code ${err.details.code}. Script output:
          ${err.details.output}
        `,
    })
  }
})

export const gardenPlugin = execPlugin
export const initializeActionTypes = async () => {
  // Attach the action types
  await import("./build.js")
  await import("./deploy.js")
  await import("./run.js")
  await import("./test.js")
}
