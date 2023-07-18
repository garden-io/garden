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

// These plugins are always registered
export const getBundledPlugins = (): GardenPluginReference[] => [
  { name: "conftest", callback: () => require("@garden-io/garden-conftest").gardenPlugin() },
  { name: "conftest-container", callback: () => require("@garden-io/garden-conftest-container").gardenPlugin() },
  { name: "conftest-kubernetes", callback: () => require("@garden-io/garden-conftest-kubernetes").gardenPlugin() },
  { name: "jib", callback: () => require("@garden-io/garden-jib").gardenPlugin() },
  { name: "terraform", callback: () => require("@garden-io/garden-terraform").gardenPlugin() },
  { name: "pulumi", callback: () => require("@garden-io/garden-pulumi").gardenPlugin() },
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
      wrapActiveSpan("garden", async (span) => {
        if (!cli) {
          cli = new GardenCli({ plugins: getBundledPlugins(), initLogger })
        }

        // Note: We slice off the binary/script name from argv.
        const results = await cli!.run({ args: args || [], exitOnError })

        return results
      })
    )
    code = result.code
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`Warning: Exiting with unhandled error\n${err.message}`)
    code = 1
  } finally {
    if (cli?.processRecord) {
      const globalConfigStore = new GlobalConfigStore()
      await globalConfigStore.delete("activeProcesses", String(cli.processRecord.pid))
    }

    try {
      await Promise.race([getOtelSDK().shutdown(), new Promise((resolve) => setTimeout(resolve, 3000))])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`Debug: OTEL shutdown failed with error ${err.toString()}`)
    }

    await shutdown(code)
  }

  return { cli, result }
}
