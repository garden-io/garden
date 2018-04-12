/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { STATIC_DIR } from "../../constants"
import { Garden } from "../../garden"
import { Environment } from "../../types/common"
import {
  ConfigureEnvironmentParams,
  EnvironmentStatus,
} from "../../types/plugin"
import { Service } from "../../types/service"
import {
  ContainerModule,
  ContainerService,
} from "../container"
import { deployService } from "./deployment"
import { kubectl } from "./kubectl"
import { checkDeploymentStatus } from "./status"
import {
  createNamespace,
  namespaceReady,
} from "./namespace"

export const GARDEN_GLOBAL_SYSTEM_NAMESPACE = "garden-system"

const globalSystemProjectPath = join(STATIC_DIR, "kubernetes", "system-global")
const ingressControllerModulePath = join(globalSystemProjectPath, "ingress-controller")
const defaultBackendModulePath = join(globalSystemProjectPath, "default-backend")
const dashboardModulePath = join(globalSystemProjectPath, "kubernetes-dashboard")
const dashboardSpecPath = join(dashboardModulePath, "dashboard.yml")

export const localIngressPort = 32000

export async function getGlobalSystemStatus(ctx: Garden, env: Environment) {
  const gardenEnv = getSystemEnv(env)

  const systemNamespaceReady = namespaceReady(GARDEN_GLOBAL_SYSTEM_NAMESPACE)

  if (!systemNamespaceReady) {
    return {
      systemNamespaceReady,
      dashboardReady: false,
      ingressControllerReady: false,
      defaultBackendReady: false,
    }
  }

  const ingressControllerService = await getIngressControllerService(ctx)
  const defaultBackendService = await getDefaultBackendService(ctx)
  const dashboardService = await getDashboardService(ctx)

  const ingressControllerStatus = await checkDeploymentStatus({
    ctx,
    service: ingressControllerService,
    env: gardenEnv,
  })
  const defaultBackendStatus = await checkDeploymentStatus({
    ctx,
    service: defaultBackendService,
    env: gardenEnv,
  })
  const dashboardStatus = await checkDeploymentStatus({
    ctx,
    service: dashboardService,
    env: gardenEnv,
  })

  return {
    systemNamespaceReady,
    dashboardReady: dashboardStatus.state === "ready",
    ingressControllerReady: ingressControllerStatus.state === "ready",
    defaultBackendReady: defaultBackendStatus.state === "ready",
  }
}

export async function configureGlobalSystem(
  { ctx, env, logEntry }: ConfigureEnvironmentParams, status: EnvironmentStatus,
) {
  if (!status.detail.systemNamespaceReady) {
    logEntry && logEntry.setState({ section: "kubernetes", msg: `Creating garden system namespace` })
    await createNamespace(GARDEN_GLOBAL_SYSTEM_NAMESPACE)
  }

  if (!status.detail.dashboardReady) {
    logEntry && logEntry.setState({ section: "kubernetes", msg: `Configuring dashboard` })
    // TODO: deploy this as a service
    await kubectl(GARDEN_GLOBAL_SYSTEM_NAMESPACE).call(["apply", "-f", dashboardSpecPath])
  }

  if (!status.detail.ingressControllerReady) {
    logEntry && logEntry.setState({ section: "kubernetes", msg: `Configuring ingress controller` })
    const gardenEnv = getSystemEnv(env)

    await deployService({
      ctx,
      service: await getDefaultBackendService(ctx),
      serviceContext: { envVars: {}, dependencies: {} },
      env: gardenEnv,
      logEntry,
    })
    await deployService({
      ctx,
      service: await getIngressControllerService(ctx),
      serviceContext: { envVars: {}, dependencies: {} },
      env: gardenEnv,
      exposePorts: true,
      logEntry,
    })
  }
}

function getSystemEnv(env: Environment): Environment {
  return { name: env.name, namespace: GARDEN_GLOBAL_SYSTEM_NAMESPACE, config: { providers: {} } }
}

async function getIngressControllerService(ctx: Garden) {
  const module = <ContainerModule>await ctx.resolveModule(ingressControllerModulePath)

  return ContainerService.factory(ctx, module, "ingress-controller")
}

async function getDefaultBackendService(ctx: Garden) {
  const module = <ContainerModule>await ctx.resolveModule(defaultBackendModulePath)

  return ContainerService.factory(ctx, module, "default-backend")
}

async function getDashboardService(ctx: Garden) {
  // TODO: implement raw kubernetes module load this module the same way as the ones above
  const module = new ContainerModule(ctx, {
    version: "0",
    name: "garden-dashboard",
    type: "container",
    path: dashboardModulePath,
    services: {
      "kubernetes-dashboard": {
        daemon: false,
        dependencies: [],
        endpoints: [],
        ports: {},
        volumes: [],
      },
    },
    variables: {},
    build: { dependencies: [] },
    test: {},
  })

  return Service.factory(ctx, module, "kubernetes-dashboard")
}
