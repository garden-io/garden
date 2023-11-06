/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { GardenApiVersion, STATIC_DIR } from "../../constants.js"
import { Garden } from "../../garden.js"
import type { KubernetesPluginContext, KubernetesConfig } from "./config.js"
import type { Log } from "../../logger/log-entry.js"
import { getSystemNamespace } from "./namespace.js"
import { PluginError } from "../../exceptions.js"
import type { DeepPrimitiveMap } from "../../config/common.js"
import { combineStates } from "../../types/service.js"
import { defaultDotIgnoreFile } from "../../util/fs.js"
import { LogLevel } from "../../logger/logger.js"
import { defaultNamespace } from "../../config/project.js"

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
  log: Log
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
    _systemServices: [],
  }

  return Garden.factory(systemProjectPath, {
    gardenDirPath: join(ctx.gardenDirPath, "kubernetes.garden"),
    environmentString: "default",
    noEnterprise: true, // we don't want to e.g. verify a client auth token or fetch secrets here
    config: {
      path: systemProjectPath,
      apiVersion: GardenApiVersion.v1,
      kind: "Project",
      internal: {
        basePath: systemProjectPath,
      },
      name: systemNamespace,
      defaultEnvironment: "default",
      dotIgnoreFile: defaultDotIgnoreFile,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [sysProvider],
      variables,
    },
    commandInfo: ctx.command,
    log: log
      .createLog({
        name: "garden system",
        fixLevel: LogLevel.debug,
      })
      .info("Initializing..."),
  })
}

interface GetSystemServicesStatusParams {
  ctx: KubernetesPluginContext
  sysGarden: Garden
  log: Log
  namespace: string
  names: string[]
}

export async function getSystemServiceStatus({ sysGarden, log, names }: GetSystemServicesStatusParams) {
  const actions = await sysGarden.getActionRouter()
  const graph = await sysGarden.getConfigGraph({ log, emit: false })

  const serviceStatuses = await actions.getDeployStatuses({
    log: log.createLog({ fixLevel: LogLevel.verbose }),
    graph,
    names,
  })
  const state = combineStates(Object.values(serviceStatuses).map((s) => s.detail?.state || "unknown"))

  return {
    state,
    serviceStatuses,
  }
}

interface PrepareSystemServicesParams extends GetSystemServicesStatusParams {
  force: boolean
}

export async function prepareSystemServices({
  ctx,
  sysGarden,
  log,
  names: serviceNames,
  force,
}: PrepareSystemServicesParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  // Deploy enabled system services
  if (serviceNames.length > 0) {
    const actions = await sysGarden.getActionRouter()
    const graph = await sysGarden.getConfigGraph({ log, emit: false })
    const { error } = await actions.deployMany({
      graph,
      log,
      deployNames: serviceNames,
      force,
      forceBuild: force,
    })

    if (error) {
      throw new PluginError({
        message: `${provider.name} — an error occurred when configuring environment:\n${error}`,
      })
    }
  }
}
