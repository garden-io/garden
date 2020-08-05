/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { move } from "fs-extra"
import tmp from "tmp-promise"
import { HelmModule } from "./config"
import { containsBuildSource, getChartPath, getBaseModule } from "./common"
import { helm } from "./helm-cli"
import { ConfigurationError } from "../../../exceptions"
import { deline } from "../../../util/string"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { BuildModuleParams, BuildResult } from "../../../types/plugin/module/build"
import { basename, join } from "path"

export async function buildHelmModule({ ctx, module, log }: BuildModuleParams<HelmModule>): Promise<BuildResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const baseModule = getBaseModule(module)

  if (!baseModule && !(await containsBuildSource(module))) {
    if (!module.spec.chart) {
      throw new ConfigurationError(
        deline`Module '${module.name}' neither specifies a chart name, base module,
        nor contains chart sources at \`chartPath\`.`,
        { module }
      )
    }
    log.debug("Fetching chart...")
    try {
      await pullChart(k8sCtx, log, module)
    } catch {
      // Update the local helm repos and retry
      log.debug("Updating Helm repos...")
      // The stable repo is no longer added by default
      await helm({
        ctx: k8sCtx,
        log,
        args: ["repo", "add", "stable", "https://kubernetes-charts.storage.googleapis.com/"],
      })
      await helm({ ctx: k8sCtx, log, args: ["repo", "update"] })
      log.debug("Fetching chart (after updating)...")
      await pullChart(k8sCtx, log, module)
    }
  }

  return { fresh: true }
}

async function pullChart(ctx: KubernetesPluginContext, log: LogEntry, module: HelmModule) {
  const chartPath = await getChartPath(module)
  const chartDir = basename(chartPath)

  const tmpDir = await tmp.dir({ unsafeCleanup: true })

  try {
    const args = ["pull", module.spec.chart!, "--untar", "--untardir", tmpDir.path]

    if (module.spec.version) {
      args.push("--version", module.spec.version)
    }
    if (module.spec.repo) {
      args.push("--repo", module.spec.repo)
    }

    await helm({ ctx, log, args: [...args], cwd: tmpDir.path })

    await move(join(tmpDir.path, chartDir), chartPath, { overwrite: true })
  } finally {
    await tmpDir.cleanup()
  }
}
