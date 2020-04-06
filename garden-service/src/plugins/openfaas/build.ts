/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { PrimitiveMap } from "../../config/common"
import { KubernetesProvider } from "../kubernetes/config"
import { dumpYaml } from "../../util/util"
import { faasCli } from "./faas-cli"
import { BuildModuleParams } from "../../types/plugin/module/build"
import { containerHelpers } from "../container/helpers"
import { k8sBuildContainer, k8sGetContainerBuildStatus } from "../kubernetes/container/build"
import { GetBuildStatusParams } from "../../types/plugin/module/getBuildStatus"
import { OpenFaasModule, getK8sProvider, getContainerModule, OpenFaasProvider } from "./config"
import { LogEntry } from "../../logger/log-entry"

export const stackFilename = "stack.yml"

export async function getOpenfaasModuleBuildStatus({ ctx, log, module }: GetBuildStatusParams<OpenFaasModule>) {
  const containerModule = getContainerModule(module)
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const k8sCtx = { ...ctx, provider: k8sProvider }

  // We need to do an OpenFaas build before getting the container build status
  await buildOpenfaasFunction(<OpenFaasProvider>ctx.provider, k8sProvider, module, log)

  return k8sGetContainerBuildStatus({
    ctx: k8sCtx,
    log,
    module: containerModule,
  })
}

export async function buildOpenfaasModule({ ctx, log, module }: BuildModuleParams<OpenFaasModule>) {
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)

  const buildLog = await buildOpenfaasFunction(<OpenFaasProvider>ctx.provider, k8sProvider, module, log)

  const containerModule = getContainerModule(module)
  const k8sCtx = { ...ctx, provider: k8sProvider }
  const result = await k8sBuildContainer({
    ctx: k8sCtx,
    log,
    module: containerModule,
  })

  return { fresh: true, buildLog: buildLog + "\n" + result.buildLog }
}

export async function writeStackFile(
  provider: OpenFaasProvider,
  k8sProvider: KubernetesProvider,
  module: OpenFaasModule,
  envVars: PrimitiveMap
) {
  const containerModule = getContainerModule(module)
  const image = await containerHelpers.getDeploymentImageId(containerModule, k8sProvider.config.deploymentRegistry)

  const stackPath = join(module.buildPath, stackFilename)

  return dumpYaml(stackPath, {
    provider: {
      name: "faas",
      gateway: getExternalGatewayUrl(provider),
    },
    functions: {
      [module.name]: {
        lang: module.spec.lang,
        handler: module.spec.handler,
        image,
        environment: envVars,
      },
    },
  })
}

/**
 * Writes the stack file and builds the OpenFaaS function container with the OpenFaaS CLI
 */
async function buildOpenfaasFunction(
  provider: OpenFaasProvider,
  k8sProvider: KubernetesProvider,
  module: OpenFaasModule,
  log: LogEntry
) {
  await writeStackFile(provider, k8sProvider, module, {})

  return await faasCli.stdout({
    log,
    cwd: module.buildPath,
    args: ["build", "--shrinkwrap", "-f", stackFilename],
  })
}

function getExternalGatewayUrl(provider: OpenFaasProvider) {
  const k8sProvider = getK8sProvider(provider.dependencies)
  const hostname = provider.config.hostname
  const ingressPort = k8sProvider.config.ingressHttpPort
  return provider.config.gatewayUrl || `http://${hostname}:${ingressPort}`
}
