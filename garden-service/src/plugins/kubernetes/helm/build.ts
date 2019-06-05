/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { HelmModule } from "./config"
import { containsSource, getChartPath, getValuesPath, getBaseModule } from "./common"
import { helm } from "./helm-cli"
import { safeLoad } from "js-yaml"
import { dumpYaml } from "../../../util/util"
import { LogEntry } from "../../../logger/log-entry"
import { getNamespace } from "../namespace"
import { apply as jsonMerge } from "json-merge-patch"
import { KubernetesPluginContext } from "../config"
import { BuildModuleParams, BuildResult } from "../../../types/plugin/module/build"

export async function buildHelmModule({ ctx, module, log }: BuildModuleParams<HelmModule>): Promise<BuildResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getNamespace({ ctx: k8sCtx, log, provider: k8sCtx.provider, skipCreate: true })
  const context = ctx.provider.config.context
  const baseModule = getBaseModule(module)

  if (!baseModule && !(await containsSource(module))) {
    log.debug("Fetching chart...")
    try {
      await fetchChart(namespace, context, log, module)
    } catch {
      // update the local helm repo and retry
      log.debug("Updating Helm repo...")
      await helm(namespace, context, log, ...["repo", "update"])
      log.debug("Fetching chart (after updating)...")
      await fetchChart(namespace, context, log, module)
    }
  }

  const chartPath = await getChartPath(module)

  // create the values.yml file (merge the configured parameters into the default values)
  log.debug("Preparing chart...")
  const chartValues = safeLoad(await helm(namespace, context, log, "inspect", "values", chartPath)) || {}

  // Merge with the base module's values, if applicable
  const specValues = baseModule ? jsonMerge(baseModule.spec.values, module.spec.values) : module.spec.values

  const mergedValues = jsonMerge(chartValues, specValues)

  const valuesPath = getValuesPath(chartPath)
  log.silly(`Writing chart values to ${valuesPath}`)
  await dumpYaml(valuesPath, mergedValues)

  return { fresh: true }
}

async function fetchChart(namespace: string, context: string, log: LogEntry, module: HelmModule) {
  const buildPath = module.buildPath

  await helm(namespace, context, log, "init", "--client-only")

  const fetchArgs = [
    "fetch", module.spec.chart!,
    "--destination", buildPath,
    "--untar",
  ]
  if (module.spec.version) {
    fetchArgs.push("--version", module.spec.version)
  }
  if (module.spec.repo) {
    fetchArgs.push("--repo", module.spec.repo)
  }
  await helm(namespace, context, log, ...fetchArgs)
}
