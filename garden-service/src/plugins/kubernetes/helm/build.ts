/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildModuleParams } from "../../../types/plugin/params"
import { HelmModule } from "./config"
import { BuildResult } from "../../../types/plugin/outputs"
import { containsSource, getChartPath, getValuesPath } from "./common"
import { helm } from "./helm-cli"
import { safeLoad } from "js-yaml"
import { set } from "lodash"
import { dumpYaml } from "../../../util/util"
import { join } from "path"
import { GARDEN_BUILD_VERSION_FILENAME } from "../../../constants"
import { writeModuleVersionFile } from "../../../vcs/base"
import { LogEntry } from "../../../logger/log-entry"
import { getNamespace } from "../namespace"

export async function buildHelmModule({ ctx, module, log }: BuildModuleParams<HelmModule>): Promise<BuildResult> {
  const buildPath = module.buildPath
  const namespace = await getNamespace({ ctx, provider: ctx.provider, skipCreate: true })
  const context = ctx.provider.config.context

  if (!(await containsSource(module))) {
    log.setState("Fetching chart...")
    try {
      await fetchChart(namespace, context, log, module)
    } catch {
      // update the local helm repo and retry
      log.setState("Updating Helm repo...")
      await helm(namespace, context, log, ...["repo", "update"])
      log.setState("Fetching chart (after updating)...")
      await fetchChart(namespace, context, log, module)
    }
  }

  const chartPath = await getChartPath(module)

  // create the values.yml file (merge the configured parameters into the default values)
  log.setState("Preparing chart...")
  const values = safeLoad(await helm(namespace, context, log, "inspect", "values", chartPath)) || {}

  Object.entries(flattenValues(module.spec.values))
    .map(([k, v]) => set(values, k, v))

  const valuesPath = getValuesPath(chartPath)
  await dumpYaml(valuesPath, values)

  // keep track of which version has been built
  const buildVersionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)
  const version = module.version
  await writeModuleVersionFile(buildVersionFilePath, version)

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

// adapted from https://gist.github.com/penguinboy/762197
function flattenValues(object, prefix = "") {
  return Object.keys(object).reduce(
    (prev, element) =>
      object[element] && typeof object[element] === "object" && !Array.isArray(object[element])
        ? { ...prev, ...flattenValues(object[element], `${prefix}${element}.`) }
        : { ...prev, ...{ [`${prefix}${element}`]: object[element] } },
    {},
  )
}
