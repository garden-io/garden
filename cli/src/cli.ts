/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { shutdown } from "@garden-io/core/build/src/util/util"
import { gardenEnv } from "@garden-io/core/build/src/constants"
import { getDefaultProfiler } from "@garden-io/core/build/src/util/profiling"
import { GardenProcess } from "@garden-io/core/build/src/db/entities/garden-process"
import { ensureConnected } from "@garden-io/core/build/src/db/connection"
import { GardenCli } from "@garden-io/core/build/src/cli/cli"

export async function runCli({ args, cli }: { args?: string[]; cli?: GardenCli } = {}): Promise<void> {
  let code = 0

  if (!args) {
    args = process.argv.slice(2)
  }

  await ensureConnected()
  const processRecord = await GardenProcess.register(args)

  try {
    if (!cli) {
      cli = new GardenCli()
    }
    // Note: We slice off the binary/script name from argv.
    const result = await cli.run({ args, exitOnError: true, processRecord })
    code = result.code
  } catch (err) {
    // tslint:disable-next-line: no-console
    console.log(err.message)
    code = 1
  } finally {
    await processRecord.remove()

    if (gardenEnv.GARDEN_ENABLE_PROFILING) {
      // tslint:disable-next-line: no-console
      console.log(getDefaultProfiler().report())
    }

    await shutdown(code)
  }
}
