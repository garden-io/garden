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
import { BuildModuleParams } from "../../types/plugin/module/build"
import { containerHelpers } from "../container/helpers"
import { k8sBuildContainer, k8sGetContainerBuildStatus } from "../kubernetes/container/build/build"
import { GetBuildStatusParams } from "../../types/plugin/module/getBuildStatus"
import { OpenFaasModule, getContainerModule, OpenFaasProvider } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { PluginContext } from "../../plugin-context"
import { getK8sProvider } from "../kubernetes/util"
import { ensureDir, copy } from "fs-extra"

export const stackFilename = "stack.yml"

export async function getOpenfaasModuleBuildStatus({ ctx, log, module }: GetBuildStatusParams<OpenFaasModule>) {
  const containerModule = getContainerModule(module)
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const k8sCtx = { ...ctx, provider: k8sProvider }

  // We need to do an OpenFaas build before getting the container build status
  await buildOpenfaasFunction(ctx, <OpenFaasProvider>ctx.provider, k8sProvider, module, log)

  return k8sGetContainerBuildStatus({
    ctx: k8sCtx,
    log,
    module: containerModule,
  })
}

export async function buildOpenfaasModule({ ctx, log, module }: BuildModuleParams<OpenFaasModule>) {
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)

  const buildLog = await buildOpenfaasFunction(ctx, <OpenFaasProvider>ctx.provider, k8sProvider, module, log)

  const containerModule = getContainerModule(module)
  const k8sCtx = { ...ctx, provider: k8sProvider }
  const result = await k8sBuildContainer({
    ctx: k8sCtx,
    log,
    module: containerModule,
  })

  return { fresh: true, buildLog: buildLog + "\n" + result.buildLog }
}

export async function prepare(
  provider: OpenFaasProvider,
  k8sProvider: KubernetesProvider,
  module: OpenFaasModule,
  envVars: PrimitiveMap
) {
  const containerModule = getContainerModule(module)
  const image = containerHelpers.getDeploymentImageId(
    containerModule,
    module.version,
    k8sProvider.config.deploymentRegistry
  )

  const templateSourcePath = join(
    module.buildDependencies["openfaas--templates"].buildPath,
    "template",
    module.spec.lang
  )
  const templatePath = join(module.buildPath, "template")
  await ensureDir(templatePath)
  await copy(templateSourcePath, join(templatePath, module.spec.lang))

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
  ctx: PluginContext,
  provider: OpenFaasProvider,
  k8sProvider: KubernetesProvider,
  module: OpenFaasModule,
  log: LogEntry
) {
  await prepare(provider, k8sProvider, module, {})

  return await ctx.tools["openfaas.faas-cli"].stdout({
    log,
    cwd: module.buildPath,
    args: ["build", "--shrinkwrap", "-f", join(module.buildPath, stackFilename), "--handler", module.buildPath],
  })
}

function getExternalGatewayUrl(provider: OpenFaasProvider) {
  const k8sProvider = getK8sProvider(provider.dependencies)
  const hostname = provider.config.hostname
  const ingressPort = k8sProvider.config.ingressHttpPort
  return provider.config.gatewayUrl || `http://${hostname}:${ingressPort}`
}
