/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { move } from "fs-extra"
import tmp from "tmp-promise"
import { getChartPath } from "./common"
import { helm } from "./helm-cli"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { basename, join } from "path"
import { defaultHelmRepo, HelmDeployAction } from "./config"
import { Resolved } from "../../../actions/types"

export async function pullChart(ctx: KubernetesPluginContext, log: LogEntry, action: Resolved<HelmDeployAction>) {
  const chartPath = await getChartPath(action)
  const chartDir = basename(chartPath)

  const chartSpec = action.getSpec("chart") || {}

  if (!chartSpec.name) {
    // Nothing to pull
    // TODO-G2: check if this is okay by the callers
    return
  }

  const tmpDir = await tmp.dir({ unsafeCleanup: true })

  try {
    const args = [
      "pull",
      chartSpec.name,
      // Instead of implicitly adding and updating the "stable" repo, we set the stable repo URL as a default here
      "--repo",
      chartSpec.repo || defaultHelmRepo,
      "--untar",
      "--untardir",
      tmpDir.path,
    ]

    if (chartSpec.version) {
      args.push("--version", chartSpec.version)
    }

    await helm({ ctx, log, args: [...args], cwd: tmpDir.path })

    await move(join(tmpDir.path, chartDir), chartPath, { overwrite: true })
  } finally {
    await tmpDir.cleanup()
  }
}
