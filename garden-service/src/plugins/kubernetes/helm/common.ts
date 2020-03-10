/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isPlainObject, flatten } from "lodash"
import { join, resolve } from "path"
import { pathExists, writeFile, remove } from "fs-extra"
import cryptoRandomString = require("crypto-random-string")

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { getModuleNamespace } from "../namespace"
import { KubernetesResource } from "../types"
import { loadAll } from "js-yaml"
import { helm } from "./helm-cli"
import { HelmModule, HelmModuleConfig } from "./config"
import { ConfigurationError, PluginError } from "../../../exceptions"
import { Module } from "../../../types/module"
import { deline, tailString } from "../../../util/string"
import { getAnnotation, flattenResources } from "../util"
import { KubernetesPluginContext } from "../config"
import { RunResult } from "../../../types/plugin/base"
import { MAX_RUN_RESULT_LOG_LENGTH } from "../constants"

const gardenValuesFilename = "garden-values.yml"

async function containsChart(basePath: string, config: HelmModuleConfig) {
  const yamlPath = join(basePath, config.spec.chartPath, "Chart.yaml")
  return pathExists(yamlPath)
}

/**
 * Returns true if the specified Helm module contains a template (as opposed to just referencing a remote template).
 */
export async function containsSource(config: HelmModuleConfig) {
  return containsChart(config.path, config)
}

/**
 * Returns true if the specified Helm module contains a template in its build path (as opposed to just referencing
 * a remote template).
 */
export async function containsBuildSource(module: HelmModule) {
  return containsChart(module.buildPath, module)
}

/**
 * Render the template in the specified Helm module (locally), and return all the resources in the chart.
 */
export async function getChartResources(ctx: PluginContext, module: Module, hotReload: boolean, log: LogEntry) {
  const k8sCtx = <KubernetesPluginContext>ctx

  const objects = <KubernetesResource[]>loadTemplate(await renderTemplates(k8sCtx, module, hotReload, log))

  const resources = objects.filter((obj) => {
    // Don't try to check status of hooks
    const helmHook = getAnnotation(obj, "helm.sh/hook")
    if (helmHook) {
      return false
    }

    // Ephemeral objects should also not be checked
    if (obj.kind === "Pod" || obj.kind === "Job") {
      return false
    }

    return true
  })

  return flattenResources(resources)
}

export async function renderTemplates(ctx: KubernetesPluginContext, module: Module, hotReload: boolean, log: LogEntry) {
  const chartPath = await getChartPath(module)
  const releaseName = getReleaseName(module)
  const namespace = await getModuleNamespace({
    ctx,
    log,
    module,
    provider: ctx.provider,
    skipCreate: true,
  })

  return helm({
    ctx,
    log,
    namespace,
    args: [
      "template",
      releaseName,
      "--namespace",
      namespace,
      "--dependency-update",
      ...(await getValueArgs(module, hotReload)),
      chartPath,
    ],
  })
}

/**
 * Returns the base module of the specified Helm module, or undefined if none is specified.
 * Throws an error if the referenced module is missing, or is not a Helm module.
 */
export function getBaseModule(module: HelmModule) {
  if (!module.spec.base) {
    return
  }

  const baseModule = module.buildDependencies[module.spec.base]

  if (!baseModule) {
    throw new PluginError(
      deline`Helm module '${module.name}' references base module '${module.spec.base}'
      but it is missing from the module's build dependencies.`,
      { moduleName: module.name, baseModuleName: module.spec.base }
    )
  }

  if (baseModule.type !== "helm") {
    throw new ConfigurationError(
      deline`Helm module '${module.name}' references base module '${module.spec.base}'
      which is a '${baseModule.type}' module, but should be a helm module.`,
      { moduleName: module.name, baseModuleName: module.spec.base, baseModuleType: baseModule.type }
    )
  }

  return baseModule
}

/**
 * Get the full path to the chart, within the module build directory.
 */
export async function getChartPath(module: HelmModule) {
  const baseModule = getBaseModule(module)

  if (baseModule) {
    return join(module.buildPath, baseModule.spec.chartPath)
  } else if (await containsBuildSource(module)) {
    return join(module.buildPath, module.spec.chartPath)
  } else {
    // This value is validated to exist in the validate module action
    const splitName = module.spec.chart!.split("/")
    const chartDir = splitName[splitName.length - 1]
    return join(module.buildPath, chartDir)
  }
}

/**
 * Get the path to the values file that we generate (garden-values.yml) within the chart directory.
 */
export function getGardenValuesPath(chartPath: string) {
  return join(chartPath, gardenValuesFilename)
}

/**
 * Get the value files arguments that should be applied to any helm install/render command.
 */
export async function getValueArgs(module: HelmModule, hotReload: boolean) {
  const chartPath = await getChartPath(module)
  const gardenValuesPath = getGardenValuesPath(chartPath)

  // The garden-values.yml file (which is created from the `values` field in the module config) takes precedence,
  // so it's added to the end of the list.
  const valueFiles = module.spec.valueFiles.map((f) => resolve(module.buildPath, f)).concat([gardenValuesPath])

  const args = flatten(valueFiles.map((f) => ["--values", f]))

  if (hotReload) {
    args.push("--set", "\\.garden.hotReload=true")
  }

  return args
}

/**
 * Get the release name to use for the module/chart (the module name, unless overridden in config).
 */
export function getReleaseName(config: HelmModuleConfig) {
  return config.spec.releaseName || config.name
}

/**
 * This is a dirty hack that allows us to resolve Helm template strings ad-hoc.
 * Basically this writes a dummy file to the chart, has Helm resolve it, and then deletes the file.
 */
export async function renderHelmTemplateString(
  ctx: PluginContext,
  log: LogEntry,
  module: HelmModule,
  chartPath: string,
  value: string
): Promise<string> {
  const relPath = join("templates", cryptoRandomString({ length: 16 }) + ".yaml")
  const tempFilePath = join(chartPath, relPath)
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const releaseName = getReleaseName(module)

  try {
    // Need to add quotes for this to work as expected. Also makes sense since we only support string outputs here.
    await writeFile(tempFilePath, `value: '${value}'\n`)

    const objects = loadTemplate(
      await helm({
        ctx: k8sCtx,
        log,
        namespace,
        args: [
          "template",
          releaseName,
          "--namespace",
          namespace,
          "--dependency-update",
          ...(await getValueArgs(module, false)),
          "--show-only",
          relPath,
          chartPath,
        ],
      })
    )

    return objects[0].value
  } finally {
    await remove(tempFilePath)
  }
}

/**
 * Helm templates can include duplicate keys, e.g. because of a mistake in the remote chart repo.
 * We therefore load the template with `{ json: true }`, so that duplicate keys in a mapping will override values rather
 * than throwing an error.
 *
 * However, this behavior is broken for the `safeLoadAll` function, see: https://github.com/nodeca/js-yaml/issues/456.
 * We therefore need to use the `loadAll` function. See the following link for a conversation on using
 * `loadAll` in this context: https://github.com/kubeapps/kubeapps/issues/636.
 */
export function loadTemplate(template: string) {
  return loadAll(template, undefined, { json: true })
    .filter((obj) => obj !== null)
    .map((obj) => {
      if (isPlainObject(obj)) {
        if (!obj.metadata) {
          obj.metadata = {}
        }
        if (!obj.metadata.annotations) {
          obj.metadata.annotations = {}
        }
      }
      return obj
    })
}

export function trimRunOutput<T extends RunResult>(result: T): T {
  const log = tailString(result.log, MAX_RUN_RESULT_LOG_LENGTH, true)

  return {
    ...result,
    log,
  }
}
