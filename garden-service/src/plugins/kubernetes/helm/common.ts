/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { find } from "lodash"
import { join } from "path"
import { pathExists, writeFile, remove } from "fs-extra"
import cryptoRandomString = require("crypto-random-string")
import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { getNamespace } from "../namespace"
import { KubernetesResource } from "../types"
import { safeLoadAll } from "js-yaml"
import { helm } from "./helm-cli"
import { HelmModule, HelmModuleConfig, HelmResourceSpec } from "./config"
import { HotReloadableResource } from "../hot-reload"
import { ConfigurationError } from "../../../exceptions"
import { Module } from "../../../types/module"
import { findByName } from "../../../util/util"

/**
 * Returns true if the specified Helm module contains a template (as opposed to just referencing a remote template).
 */
export async function containsSource(config: HelmModuleConfig) {
  const yamlPath = join(config.path, config.spec.chartPath, "Chart.yaml")
  return pathExists(yamlPath)
}

/**
 * Render the template in the specified Helm module (locally), and return all the resources in the chart.
 */
export async function getChartResources(ctx: PluginContext, module: Module, log: LogEntry) {
  const chartPath = await getChartPath(module)
  const valuesPath = getValuesPath(chartPath)
  const namespace = await getNamespace({ ctx, provider: ctx.provider, skipCreate: true })
  const context = ctx.provider.config.context
  const releaseName = getReleaseName(module)

  const objects = <KubernetesResource[]>safeLoadAll(await helm(namespace, context, log,
    "template",
    "--name", releaseName,
    "--namespace", namespace,
    "--values", valuesPath,
    chartPath,
  ))

  return objects.filter(obj => obj !== null).map((obj) => {
    if (!obj.metadata.annotations) {
      obj.metadata.annotations = {}
    }
    return obj
  })
}

/**
 * Get the full path to the chart, within the module build directory.
 */
export async function getChartPath(module: HelmModule) {
  if (await containsSource(module)) {
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
export function getValuesPath(chartPath: string) {
  return join(chartPath, "garden-values.yml")
}

/**
 * Get the release name to use for the module/chart (currently just the module name).
 */
export function getReleaseName(module: HelmModule) {
  return module.name
}

interface GetServiceResourceParams {
  ctx: PluginContext,
  log: LogEntry,
  chartResources: KubernetesResource[],
  module: HelmModule,
  resourceSpec?: HelmResourceSpec,
}

/**
 * Finds and returns the configured service resource from the specified chart resources, that we can use for
 * hot-reloading and other service-specific functionality.
 *
 * Optionally provide a `resourceSpec`, which is then used instead of the default `module.serviceResource` spec.
 *
 * Throws an error if no valid resource spec is given, or the resource spec doesn't match any of the given resources.
 */
export async function findServiceResource(
  { ctx, log, chartResources, module, resourceSpec }: GetServiceResourceParams,
): Promise<HotReloadableResource> {
  if (!resourceSpec) {
    resourceSpec = module.spec.serviceResource
  }

  if (!resourceSpec) {
    throw new ConfigurationError(
      `Module '${module.name}' doesn't specify a \`serviceResource\` in its configuration. ` +
      `You must specify it in the module config in order to use certain Garden features, such as hot reloading.`,
      { resourceSpec },
    )
  }

  const targetKind = resourceSpec.kind
  let targetName = resourceSpec.name

  const chartResourceNames = chartResources.map(o => `${o.kind}/${o.metadata.name}`)
  const applicableChartResources = chartResources.filter(o => o.kind === targetKind)

  let target: HotReloadableResource

  if (targetName) {
    if (targetName.includes("{{")) {
      // need to resolve the template string
      const chartPath = await getChartPath(module)
      targetName = await renderHelmTemplateString(ctx, log, module, chartPath, targetName)
    }

    target = find(
      <HotReloadableResource[]>chartResources,
      o => o.kind === targetKind && o.metadata.name === targetName,
    )!

    if (!target) {
      throw new ConfigurationError(
        `Module '${module.name}' does not contain specified ${targetKind} '${targetName}'`,
        { resourceSpec, chartResourceNames },
      )
    }
  } else {
    if (applicableChartResources.length === 0) {
      throw new ConfigurationError(
        `Module '${module.name}' contains no ${targetKind}s.`,
        { resourceSpec, chartResourceNames },
      )
    }

    if (applicableChartResources.length > 1) {
      throw new ConfigurationError(
        `Module '${module.name}' contains multiple ${targetKind}s. ` +
        `You must specify \`serviceResource.name\` in the module config in order to identify ` +
        `the correct ${targetKind}.`,
        { resourceSpec, chartResourceNames },
      )
    }

    target = <HotReloadableResource>applicableChartResources[0]
  }

  return target
}

/**
 * From the given Deployment, DaemonSet or StatefulSet resource, get either the first container spec,
 * or if `containerName` is specified, the one matching that name.
 */
export function getResourceContainer(resource: HotReloadableResource, containerName?: string) {
  const kind = resource.kind
  const name = resource.metadata.name

  const containers = resource.spec.template.spec.containers || []

  if (containers.length === 0) {
    throw new ConfigurationError(
      `${kind} ${resource.metadata.name} has no containers configured.`,
      { resource },
    )
  }

  const container = containerName ? findByName(containers, containerName) : containers[0]

  if (!container) {
    throw new ConfigurationError(
      `Could not find container '${containerName}' in ${kind} '${name}'`,
      { resource, containerName },
    )
  }

  return container
}

/**
 * This is a dirty hack that allows us to resolve Helm template strings ad-hoc.
 * Basically this writes a dummy file to the chart, has Helm resolve it, and then deletes the file.
 *
 * TODO: Cache the results to avoid a performance hit when hot-reloading.
 */
async function renderHelmTemplateString(
  ctx: PluginContext, log: LogEntry, module: Module, chartPath: string, value: string,
): Promise<string> {
  const tempFilePath = join(chartPath, "templates", cryptoRandomString(16))
  const valuesPath = getValuesPath(chartPath)
  const namespace = await getNamespace({ ctx, provider: ctx.provider, skipCreate: true })
  const releaseName = getReleaseName(module)
  const context = ctx.provider.config.context

  try {
    await writeFile(tempFilePath, value)

    const objects = safeLoadAll(await helm(namespace, context, log,
      "template",
      "--name", releaseName,
      "--namespace", namespace,
      "--values", valuesPath,
      "-x", tempFilePath,
      chartPath,
    ))

    return objects[0]

  } finally {
    await remove(tempFilePath)
  }
}
