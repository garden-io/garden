/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { shutdown } from "@garden-io/core/build/src/util/util.js"
import type { RunOutput } from "@garden-io/core/build/src/cli/cli.js"
import { GardenCli } from "@garden-io/core/build/src/cli/cli.js"
import type { GardenPluginReference } from "@garden-io/core/build/src/plugin/plugin.js"
import { GlobalConfigStore } from "@garden-io/core/build/src/config-store/global.js"
import { getOtelSDK, isOtelExporterConfigured } from "@garden-io/core/build/src/util/open-telemetry/tracing.js"
import { withContextFromEnv } from "@garden-io/core/build/src/util/open-telemetry/propagation.js"
import { wrapActiveSpan } from "@garden-io/core/build/src/util/open-telemetry/spans.js"
import { InternalError } from "@garden-io/core/build/src/exceptions.js"
import { styles } from "@garden-io/core/build/src/logger/styles.js"
import { gardenEnv, IGNORE_UNCAUGHT_EXCEPTION_VARNAME } from "@garden-io/core/build/src/constants.js"
import { inspect } from "node:util"
import { waitForOutputFlush } from "@garden-io/core/build/src/process.js"

// These plugins are always registered
export const getBundledPlugins = (): GardenPluginReference[] => [
  {
    name: "jib",
    callback: async () => {
      const plugin = await import("@garden-io/garden-jib")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "terraform",
    callback: async () => {
      const plugin = await import("@garden-io/garden-terraform")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "pulumi",
    callback: async () => {
      const plugin = await import("@garden-io/garden-pulumi")
      return plugin.gardenPlugin()
    },
  },
]

let ignoredUncaughtExceptions = false

if (gardenEnv.GARDEN_IGNORE_UNCAUGHT_EXCEPTION) {
  console.warn(
    styles.warning(
      `\nWARNING: The environment variable ${IGNORE_UNCAUGHT_EXCEPTION_VARNAME} is set to true. This is not a recommended mode of operation.\n`
    )
  )

  process.on("uncaughtException", (e: unknown) => {
    ignoredUncaughtExceptions = true
    console.warn(
      `\n${styles.warning(`WARNING: Ignoring fatal exception because ${IGNORE_UNCAUGHT_EXCEPTION_VARNAME} is set to true`)}: ${inspect(
        e,
        {
          showHidden: true,
          getters: true,
        }
      )}\n`
    )
  })
}

export async function runCli({
  args,
  cli,
  initLogger = true,
}: { args?: string[]; cli?: GardenCli; initLogger?: boolean } = {}) {
  let code = 0
  let result: RunOutput | undefined = undefined
  const startedAt = new Date()

  if (!args) {
    args = process.argv.slice(2)
  }

  try {
    // initialize the tracing to capture the full cli execution
    result = await withContextFromEnv(() =>
      wrapActiveSpan("garden", async () => {
        if (!cli) {
          cli = new GardenCli({ plugins: getBundledPlugins(), initLogger })
        }

        // Note: We slice off the binary/script name from argv.
        const results = await cli.run({ args: args || [], startedAt })

        return results
      })
    )
    code = result.code
  } catch (err) {
    logUnexpectedError(err, "Unhandled error")
    code = 1
  } finally {
    if (cli?.processRecord) {
      const globalConfigStore = new GlobalConfigStore()
      await globalConfigStore.delete("activeProcesses", String(cli.processRecord.pid))
    }

    // Calling "shutdown" will hang if the command exits before OTEL is set up. This will happen if an
    // exporter is NOT set via the OTEL_ env var AND if Garden exits before it sets an exporter.
    if (isOtelExporterConfigured()) {
      try {
        await Promise.race([getOtelSDK().shutdown(), new Promise((resolve) => setTimeout(resolve, 3000))])
      } catch (err) {
        logUnexpectedError(err, "OTEL shutdown failed")
      }
    }

    if (ignoredUncaughtExceptions) {
      console.warn(
        styles.warning(
          `\nWARNING: Ignored a fatal exception because ${IGNORE_UNCAUGHT_EXCEPTION_VARNAME} is set to true. Exiting with code 1.\n`
        )
      )
      code = 1
    }

    await waitForOutputFlush()
    await shutdown(code)
  }

  return { cli, result }
}

function logUnexpectedError(error: unknown, context: string) {
  // NOTE: If this function is called, this is always a bug, because GardenCli.run is designed to return an error code. If it throws an error, something is wrong with our code and we need to fix it.
  // This is why we wrap the error with InternalError here, even if it is a GardenError already, because  if an error hits this code path, it's definitely a crash and we need to fix that bug.
  const wrappedError = InternalError.wrapError(error)

  // eslint-disable-next-line no-console
  console.log(`${wrappedError.explain(context)}`)
}
