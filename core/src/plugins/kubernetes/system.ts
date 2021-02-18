/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { STATIC_DIR, DEFAULT_API_VERSION } from "../../constants"
import { Garden } from "../../garden"
import { KubernetesPluginContext, KubernetesConfig } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { getSystemNamespace } from "./namespace"
import { PluginError } from "../../exceptions"
import { DeepPrimitiveMap } from "../../config/common"
import { combineStates } from "../../types/service"
import { defaultDotIgnoreFiles } from "../../util/fs"
import { LogLevel } from "../../logger/log-node"
import { defaultNamespace } from "../../config/project"

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
  const systemNamespace = await getSystemNamespace(ctx, ctx.provider, log)

  // TODO: Find a better way to apply this. As it was, it was basically a circular dependency between these
  //       two providers.
  // const conftestConfig = {
  //   environments: ["default"],
  //   name: "conftest-kubernetes",
  //   policyPath: "policy",
  //   testFailureThreshold: "warn",
  // }

  const sysProvider: KubernetesConfig = {
    ...ctx.provider.config,
    environments: ["default"],
    name: ctx.provider.name,
    namespace: { name: systemNamespace },
    deploymentStrategy: "rolling",
    _systemServices: [],
  }

  return Garden.factory(systemProjectPath, {
    gardenDirPath: join(ctx.gardenDirPath, "kubernetes.garden"),
    environmentName: "default",
    noEnterprise: true, // we don't want to e.g. verify a client auth token or fetch secrets here
    config: {
      path: systemProjectPath,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: systemNamespace,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [sysProvider],
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

interface GetSystemServicesStatusParams {
  ctx: KubernetesPluginContext
  sysGarden: Garden
  log: LogEntry
  namespace: string
  serviceNames: string[]
}

export async function getSystemServiceStatus({ sysGarden, log, serviceNames }: GetSystemServicesStatusParams) {
  const actions = await sysGarden.getActionRouter()

  const serviceStatuses = await actions.getServiceStatuses({
    log: log.placeholder({ level: LogLevel.verbose, childEntriesInheritLevel: true }),
    serviceNames,
  })
  const state = combineStates(Object.values(serviceStatuses).map((s) => (s && s.state) || "unknown"))

  return {
    state,
    serviceStatuses,
  }
}

interface PrepareSystemServicesParams extends GetSystemServicesStatusParams {
  force: boolean
}

export async function prepareSystemServices({ ctx, sysGarden, log, serviceNames, force }: PrepareSystemServicesParams) {
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
