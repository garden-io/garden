/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { shutdown } from "@garden-io/core/build/src/util/util"
import { GardenCli, RunOutput } from "@garden-io/core/build/src/cli/cli"
import { GardenPluginReference } from "@garden-io/core/build/src/plugin/plugin"
import { GlobalConfigStore } from "@garden-io/core/build/src/config-store/global"
import { getOtelSDK } from "@garden-io/core/build/src/util/open-telemetry/tracing"
import { withContextFromEnv } from "@garden-io/core/build/src/util/open-telemetry/propagation"
import { wrapActiveSpan } from "@garden-io/core/build/src/util/open-telemetry/spans"
import { InternalError } from "@garden-io/core/build/src/exceptions"

// These plugins are always registered
export const getBundledPlugins = (): GardenPluginReference[] => [
  {
    name: "conftest",
    callback: async () => {
      const plugin = await import("@garden-io/garden-conftest")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "conftest-container",
    callback: async () => {
      const plugin = await import("@garden-io/garden-conftest-container")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "conftest-kubernetes",
    callback: async () => {
      const plugin = await import("@garden-io/garden-conftest-kubernetes")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "docker-compose",
    callback: async () => {
      const plugin = await import("@garden-io/garden-docker-compose")
      return plugin.gardenPlugin.getSpec()
    },
  },
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

export async function runCli({
  args,
  cli,
  exitOnError = true,
  initLogger = true,
}: { args?: string[]; cli?: GardenCli; exitOnError?: boolean; initLogger?: boolean } = {}) {
  let code = 0
  let result: RunOutput | undefined = undefined

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
        const results = await cli.run({ args: args || [], exitOnError })

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

    try {
      await Promise.race([getOtelSDK().shutdown(), new Promise((resolve) => setTimeout(resolve, 3000))])
    } catch (err) {
      logUnexpectedError(err, "OTEL shutdown failed")
    }

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
