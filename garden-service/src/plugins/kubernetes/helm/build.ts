/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { writeFile } from "fs-extra"
import { HelmModule } from "./config"
import { containsBuildSource, getChartPath, getGardenValuesPath, getBaseModule, renderTemplates } from "./common"
import { helm } from "./helm-cli"
import { ConfigurationError } from "../../../exceptions"
import { deline } from "../../../util/string"
import { dumpYaml } from "../../../util/util"
import { LogEntry } from "../../../logger/log-entry"
import { getNamespace } from "../namespace"
import { apply as jsonMerge } from "json-merge-patch"
import { KubernetesPluginContext } from "../config"
import { BuildModuleParams, BuildResult } from "../../../types/plugin/module/build"

export async function buildHelmModule({ ctx, module, log }: BuildModuleParams<HelmModule>): Promise<BuildResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getNamespace({
    log,
    projectName: k8sCtx.projectName,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
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
      await fetchChart(k8sCtx, namespace, log, module)
    } catch {
      // Update the local helm repos and retry
      log.debug("Updating Helm repos...")
      // The stable repo is no longer added by default
      await helm({
        ctx: k8sCtx,
        namespace,
        log,
        args: ["repo", "add", "stable", "https://kubernetes-charts.storage.googleapis.com/"],
      })
      await helm({ ctx: k8sCtx, namespace, log, args: ["repo", "update"] })
      log.debug("Fetching chart (after updating)...")
      await fetchChart(k8sCtx, namespace, log, module)
    }
  }

  const chartPath = await getChartPath(module)

  // create the values.yml file (merge the configured parameters into the default values)
  log.debug("Preparing chart...")
  // Merge with the base module's values, if applicable
  const specValues = baseModule ? jsonMerge(baseModule.spec.values, module.spec.values) : module.spec.values

  // Add Garden metadata
  specValues[".garden"] = {
    moduleName: module.name,
    projectName: ctx.projectName,
    version: module.version.versionString,
  }

  const valuesPath = getGardenValuesPath(chartPath)
  log.silly(`Writing chart values to ${valuesPath}`)
  await dumpYaml(valuesPath, specValues)

  const renderedPath = join(module.buildPath, ".rendered.yaml")
  log.silly(`Writing rendered template to ${renderedPath}`)
  const rendered = await renderTemplates(k8sCtx, module, false, log)
  await writeFile(renderedPath, rendered)

  return { fresh: true }
}

async function fetchChart(ctx: KubernetesPluginContext, namespace: string, log: LogEntry, module: HelmModule) {
  const buildPath = module.buildPath

  const fetchArgs = ["fetch", module.spec.chart!, "--destination", buildPath, "--untar"]
  if (module.spec.version) {
    fetchArgs.push("--version", module.spec.version)
  }
  if (module.spec.repo) {
    fetchArgs.push("--repo", module.spec.repo)
  }
  await helm({ ctx, namespace, log, args: [...fetchArgs] })
}
