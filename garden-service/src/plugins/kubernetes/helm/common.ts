/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { find, isEmpty, isPlainObject } from "lodash"
import { join } from "path"
import { pathExists, writeFile, remove } from "fs-extra"
import cryptoRandomString = require("crypto-random-string")
import { apply as jsonMerge } from "json-merge-patch"

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { getNamespace } from "../namespace"
import { KubernetesResource } from "../types"
import { loadAll } from "js-yaml"
import { helm } from "./helm-cli"
import { HelmModule, HelmModuleConfig, HelmResourceSpec } from "./config"
import { HotReloadableResource } from "../hot-reload"
import { ConfigurationError, PluginError } from "../../../exceptions"
import { Module } from "../../../types/module"
import { findByName } from "../../../util/util"
import { deline } from "../../../util/string"
import { getAnnotation, flattenResources } from "../util"
import { KubernetesPluginContext } from "../config"

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
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getNamespace({
    configStore: k8sCtx.configStore,
    log,
    projectName: k8sCtx.projectName,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const context = ctx.provider.config.context
  const releaseName = getReleaseName(module)

  const objects = <KubernetesResource[]>loadTemplate(await helm(namespace, context, log,
    "template",
    "--name", releaseName,
    "--namespace", namespace,
    "--values", valuesPath,
    chartPath,
  ))

  const resources = objects
    .filter(obj => {
      const helmHook = getAnnotation(obj, "helm.sh/hook")
      if (helmHook && helmHook.startsWith("test-")) {
        return false
      }

      return true
    })

  return flattenResources(resources)
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
      { moduleName: module.name, baseModuleName: module.spec.base },
    )
  }

  if (baseModule.type !== "helm") {
    throw new ConfigurationError(
      deline`Helm module '${module.name}' references base module '${module.spec.base}'
      which is a '${baseModule.type}' module, but should be a helm module.`,
      { moduleName: module.name, baseModuleName: module.spec.base, baseModuleType: baseModule.type },
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
  } else if (await containsSource(module)) {
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
 * Get the release name to use for the module/chart (the module name, unless overridden in config).
 */
export function getReleaseName(config: HelmModuleConfig) {
  return config.spec.releaseName || config.name
}

/**
 * Returns the `serviceResource` spec on the module. If the module has a base module, the two resource specs
 * are merged using a JSON Merge Patch (RFC 7396).
 *
 * Throws error if no resource spec is configured, or it is empty.
 */
export function getServiceResourceSpec(module: HelmModule) {
  const baseModule = getBaseModule(module)
  let resourceSpec = module.spec.serviceResource || {}

  if (baseModule) {
    resourceSpec = jsonMerge(baseModule.spec.serviceResource || {}, resourceSpec)
  }

  if (isEmpty(resourceSpec)) {
    throw new ConfigurationError(
      deline`Helm module '${module.name}' doesn't specify a \`serviceResource\` in its configuration.
      You must specify a resource in the module config in order to use certain Garden features,
      such as hot reloading.`,
      { resourceSpec },
    )
  }

  return <HelmResourceSpec>resourceSpec
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
 * This is used when individual tasks or tests specify a resource.
 *
 * Throws an error if no valid resource spec is given, or the resource spec doesn't match any of the given resources.
 */
export async function findServiceResource(
  { ctx, log, chartResources, module, resourceSpec }: GetServiceResourceParams,
): Promise<HotReloadableResource> {
  const resourceMsgName = resourceSpec ? "resource" : "serviceResource"

  if (!resourceSpec) {
    resourceSpec = getServiceResourceSpec(module)
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
        `Helm module '${module.name}' does not contain specified ${targetKind} '${targetName}'`,
        { resourceSpec, chartResourceNames },
      )
    }
  } else {
    if (applicableChartResources.length === 0) {
      throw new ConfigurationError(
        `Helm module '${module.name}' contains no ${targetKind}s.`,
        { resourceSpec, chartResourceNames },
      )
    }

    if (applicableChartResources.length > 1) {
      throw new ConfigurationError(
        deline`Helm module '${module.name}' contains multiple ${targetKind}s.
        You must specify \`${resourceMsgName}.name\` in the module config in order to identify
        the correct ${targetKind} to use.`,
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
  const tempFilePath = join(chartPath, "templates", cryptoRandomString({ length: 16 }))
  const valuesPath = getValuesPath(chartPath)
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getNamespace({
    configStore: k8sCtx.configStore,
    log,
    projectName: k8sCtx.projectName,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const releaseName = getReleaseName(module)
  const context = ctx.provider.config.context

  try {
    await writeFile(tempFilePath, value)

    const objects = loadTemplate(await helm(namespace, context, log,
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

/**
 * Helm templates can include duplicate keys, e.g. because of a mistake in the remote chart repo.
 * We therefore load the template with `{ json: true }`, so that duplicate keys in a mapping will override values rather
 * than throwing an error.
 *
 * However, this behavior is broken for the `safeLoadAll` function, see: https://github.com/nodeca/js-yaml/issues/456.
 * We therefore need to use the `loadAll` function. See the following link for a conversation on using
 * `loadAll` in this context: https://github.com/kubeapps/kubeapps/issues/636.
 */
function loadTemplate(template: string) {
  return loadAll(template, undefined, { json: true })
    .filter(obj => obj !== null)
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
