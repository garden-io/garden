/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { V1Namespace } from "@kubernetes/client-node"
import semver from "semver"

import { STATIC_DIR, DEFAULT_API_VERSION } from "../../constants"
import { Garden } from "../../garden"
import { KubernetesPluginContext, KubernetesConfig } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { KubeApi } from "./api"
import { createNamespace, getSystemNamespace } from "./namespace"
import { getPackageVersion } from "../../util/util"
import { deline, gardenAnnotationKey } from "../../util/string"
import { deleteNamespaces } from "./namespace"
import { PluginError } from "../../exceptions"
import { DashboardPage } from "../../config/status"
import { DeepPrimitiveMap } from "../../config/common"
import { combineStates } from "../../types/service"
import { KubernetesResource } from "./types"
import { defaultDotIgnoreFiles } from "../../util/fs"
import { LogLevel } from "../../logger/log-node"
import { ConftestProviderConfig } from "../conftest/conftest"

const GARDEN_VERSION = getPackageVersion()
const SYSTEM_NAMESPACE_MIN_VERSION = "0.9.0"

const systemProjectPath = join(STATIC_DIR, "kubernetes", "system")

export const defaultSystemNamespace = "garden-system"

export function getSystemMetadataNamespaceName(config: KubernetesConfig) {
  return `${config.gardenSystemNamespace}--metadata`
}

/**
 * Note that we initialise system Garden with a custom Garden dir path. This is because
 * the system modules are stored in the static directory but we want their build products
 * stored at the project level. This way we can run several Garden processes at the same time
 * without them all modifying the same system build directory, which can cause unexpected issues.
 */
export async function getSystemGarden(
  ctx: KubernetesPluginContext,
  variables: DeepPrimitiveMap,
  log: LogEntry
): Promise<Garden> {
  const systemNamespace = await getSystemNamespace(ctx.provider, log)

  const conftest: ConftestProviderConfig = {
    environments: ["default"],
    name: "conftest-kubernetes",
    policyPath: "policy",
    testFailureThreshold: "warn",
  }

  const sysProvider: KubernetesConfig = {
    ...ctx.provider.config,
    environments: ["default"],
    name: ctx.provider.name,
    namespace: systemNamespace,
    deploymentStrategy: "rolling",
    _systemServices: [],
  }

  return Garden.factory(systemProjectPath, {
    gardenDirPath: join(ctx.gardenDirPath, "kubernetes.garden"),
    environmentName: "default",
    config: {
      path: systemProjectPath,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: systemNamespace,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", variables: {} }],
      providers: [sysProvider, conftest],
      variables,
    },
    commandInfo: ctx.command,
    log: log.debug({
      section: "garden system",
      msg: "Initializing...",
      status: "active",
      indent: 1,
      childEntriesInheritLevel: true,
    }),
  })
}

/**
 * Returns true if the namespace exists and has an up-to-date version.
 */
export async function systemNamespaceUpToDate(
  api: KubeApi,
  log: LogEntry,
  namespace: string,
  contextForLog: string
): Promise<boolean> {
  let namespaceResource: KubernetesResource<V1Namespace>

  try {
    namespaceResource = await api.core.readNamespace(namespace)
  } catch (err) {
    if (err.statusCode === 404) {
      return false
    } else {
      throw err
    }
  }

  const annotations = namespaceResource.metadata.annotations || {}
  const versionInCluster = annotations[gardenAnnotationKey("version")]

  const upToDate = !!versionInCluster && semver.gte(semver.coerce(versionInCluster)!, SYSTEM_NAMESPACE_MIN_VERSION)

  log.debug(deline`
    ${contextForLog}: current version ${GARDEN_VERSION}, version in cluster: ${versionInCluster},
    oldest permitted version: ${SYSTEM_NAMESPACE_MIN_VERSION}, up to date: ${upToDate}
  `)

  return upToDate
}

/**
 * Returns true if the namespace was outdated.
 */
export async function recreateSystemNamespaces(api: KubeApi, log: LogEntry, namespace: string) {
  const entry = log.debug({
    section: "cleanup",
    msg: "Deleting outdated system namespaces...",
    status: "active",
  })

  const metadataNamespace = `${namespace}--metadata`

  await deleteNamespaces([namespace, metadataNamespace], api, log)

  entry.setState({ msg: "Creating system namespaces..." })
  await createNamespace(api, namespace)
  await createNamespace(api, metadataNamespace)

  entry.setState({ msg: "System namespaces up to date" })
  entry.setSuccess()
}

interface GetSystemServicesStatusParams {
  ctx: KubernetesPluginContext
  sysGarden: Garden
  log: LogEntry
  namespace: string
  serviceNames: string[]
}

export async function getSystemServiceStatus({ sysGarden, log, serviceNames }: GetSystemServicesStatusParams) {
  let dashboardPages: DashboardPage[] = []

  const actions = await sysGarden.getActionRouter()

  const serviceStatuses = await actions.getServiceStatuses({
    log: log.placeholder(LogLevel.verbose, true),
    serviceNames,
  })
  const state = combineStates(Object.values(serviceStatuses).map((s) => (s && s.state) || "unknown"))

  return {
    state,
    serviceStatuses,
    dashboardPages,
  }
}

interface PrepareSystemServicesParams extends GetSystemServicesStatusParams {
  force: boolean
}

export async function prepareSystemServices({
  ctx,
  sysGarden,
  log,
  namespace,
  serviceNames,
  force,
}: PrepareSystemServicesParams) {
  const api = await KubeApi.factory(log, ctx.provider)

  const contextForLog = `Preparing environment for plugin "${ctx.provider.name}"`
  const outdated = !(await systemNamespaceUpToDate(api, log, namespace, contextForLog))

  if (outdated) {
    await recreateSystemNamespaces(api, log, namespace)
  }

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  // Deploy enabled system services
  if (serviceNames.length > 0) {
    const actions = await sysGarden.getActionRouter()
    const graph = await sysGarden.getConfigGraph(log)
    const results = await actions.deployServices({
      graph,
      log,
      serviceNames,
      force,
      forceBuild: force,
    })

    const failed = Object.values(results)
      .filter((r) => r && r.error)
      .map((r) => r!)
    const errors = failed.map((r) => r.error)

    if (failed.length === 1) {
      const error = errors[0]

      throw new PluginError(`${provider.name} — an error occurred when configuring environment:\n${error}`, {
        error,
        results,
      })
    } else if (failed.length > 0) {
      const errorsStr = errors.map((e) => `- ${e}`).join("\n")

      throw new PluginError(
        `${provider.name} — ${failed.length} errors occurred when configuring environment:\n${errorsStr}`,
        {
          errors,
          results,
        }
      )
    }
  }
}
