/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { shutdown } from "@garden-io/core/build/src/util/util"
import { GardenCli, RunOutput } from "@garden-io/core/build/src/cli/cli"
import { GardenPluginReference } from "@garden-io/core/build/src/types/plugin/plugin"

// These plugins are always registered
export const getBundledPlugins = (): GardenPluginReference[] => [
  { name: "conftest", callback: () => require("@garden-io/garden-conftest").gardenPlugin() },
  { name: "conftest-container", callback: () => require("@garden-io/garden-conftest-container").gardenPlugin() },
  { name: "conftest-kubernetes", callback: () => require("@garden-io/garden-conftest-kubernetes").gardenPlugin() },
  { name: "jib", callback: () => require("@garden-io/garden-jib").gardenPlugin() },
  { name: "maven-container", callback: () => require("@garden-io/garden-maven-container").gardenPlugin() },
]

export async function runCli({
  args,
  cli,
  exitOnError = true,
}: { args?: string[]; cli?: GardenCli; exitOnError?: boolean } = {}) {
  let code = 0
  let result: RunOutput | undefined = undefined

  if (!args) {
    args = process.argv.slice(2)
  }

  try {
    if (!cli) {
      cli = new GardenCli({ plugins: getBundledPlugins() })
    }
    // Note: We slice off the binary/script name from argv.
    result = await cli.run({ args, exitOnError })
    code = result.code
  } catch (err) {
    // tslint:disable-next-line: no-console
    console.log(err.message)
    code = 1
  } finally {
    await cli?.processRecord?.remove()
    await shutdown(code)
  }

  return { cli, result }
}
