/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as execa from "execa"
import { safeLoad } from "js-yaml"
import { every, values } from "lodash"
import * as Joi from "joi"
import { join } from "path"
import { PluginError } from "../../exceptions"
import { GardenPlugin } from "../../types/plugin/plugin"
import { GetEnvironmentStatusParams, PrepareEnvironmentParams } from "../../types/plugin/params"
import { getEnvironmentStatus, prepareEnvironment } from "./actions"
import { validate } from "../../config/common"
import {
  gardenPlugin as k8sPlugin,
  KubernetesConfig,
} from "./kubernetes"
import { getSystemGarden, isSystemGarden } from "./system"
import { readFile } from "fs-extra"
import { LogEntry } from "../../logger/logger"
import { homedir } from "os"
import { helm } from "./helm"
import { PluginContext } from "../../plugin-context"
import { providerConfigBaseSchema } from "../../config/project"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube

// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "minikube"]
const kubeConfigPath = join(homedir(), ".kube", "config")

// extend the environment configuration to also set up an ingress controller and dashboard
export async function getLocalEnvironmentStatus(
  { ctx, logEntry }: GetEnvironmentStatusParams,
) {
  const status = await getEnvironmentStatus({ ctx, logEntry })

  if (!isSystemGarden(ctx.provider)) {
    const sysGarden = await getSystemGarden(ctx.provider)
    const sysStatus = await sysGarden.actions.getStatus()

    status.detail.systemReady = sysStatus.providers[ctx.provider.config.name].ready &&
      every(values(sysStatus.services).map(s => s.state === "ready"))
    // status.detail.systemServicesStatus = sysStatus.services
  }

  status.ready = every(values(status.detail))

  return status
}

async function configureSystemEnvironment(
  { ctx, force, logEntry }:
    { ctx: PluginContext, force: boolean, logEntry?: LogEntry },
) {
  const provider = ctx.provider
  const sysGarden = await getSystemGarden(provider)
  const sysCtx = sysGarden.getPluginContext(provider.name)

  // TODO: need to add logic here to wait for tiller to be ready
  await helm(sysCtx.provider,
    "init", "--wait",
    "--service-account", "default",
    "--upgrade",
  )

  const sysStatus = await getEnvironmentStatus({
    ctx: sysCtx,
    logEntry,
  })

  await prepareEnvironment({
    ctx: sysCtx,
    force,
    status: sysStatus,
    logEntry,
  })

  // only deploy services if configured to do so (minikube bundles the required services as addons)
  if (!provider.config._systemServices || provider.config._systemServices.length > 0) {
    const results = await sysGarden.actions.deployServices({
      serviceNames: provider.config._systemServices,
    })

    const failed = values(results.taskResults).filter(r => !!r.error).length

    if (failed) {
      throw new PluginError(`local-kubernetes: ${failed} errors occurred when configuring environment`, {
        results,
      })
    }
  }
}

async function configureLocalEnvironment(
  { ctx, force, status, logEntry }: PrepareEnvironmentParams,
) {
  await prepareEnvironment({ ctx, force, status, logEntry })

  if (!isSystemGarden(ctx.provider)) {
    await configureSystemEnvironment({ ctx, force, logEntry })
  }

  return {}
}

async function getKubeConfig(): Promise<any> {
  try {
    return safeLoad((await readFile(kubeConfigPath)).toString())
  } catch {
    return {}
  }
}

/**
 * Automatically set docker environment variables for minikube
 * TODO: it would be better to explicitly provide those to docker instead of using process.env
 */
async function setMinikubeDockerEnv() {
  const minikubeEnv = await execa.stdout("minikube", ["docker-env", "--shell=bash"])
  for (const line of minikubeEnv.split("\n")) {
    const matched = line.match(/^export (\w+)="(.+)"$/)
    if (matched) {
      process.env[matched[1]] = matched[2]
    }
  }
}

export interface LocalKubernetesConfig extends KubernetesConfig {
  _system?: Symbol
  _systemServices?: string[]
}

const configSchema = providerConfigBaseSchema
  .keys({
    context: Joi.string()
      .description("The kubectl context to use to connect to the Kubernetes cluster."),
    ingressHostname: Joi.string()
      .description("The hostname of the cluster's ingress controller."),
    _system: Joi.any().meta({ internal: true }),
    _systemServices: Joi.array().items(Joi.string())
      .meta({ internal: true })
      .description("The system services which should be automatically deployed to the cluster."),
  })
  .description("The provider configuration for the local-kubernetes plugin.")

export const name = "local-kubernetes"

export async function gardenPlugin({ projectName, config, logEntry }): Promise<GardenPlugin> {
  config = validate(config, configSchema, { context: "kubernetes provider config" })

  let context = config.context
  let defaultHostname = config.defaultHostname
  let systemServices

  if (!context) {
    // automatically detect supported kubectl context if not explicitly configured
    const kubeConfig = await getKubeConfig()
    const currentContext = kubeConfig["current-context"]

    if (currentContext && supportedContexts.includes(currentContext)) {
      // prefer current context if set and supported
      context = currentContext
      logEntry.debug({ section: name, msg: `Using current context: ${context}` })
    } else if (kubeConfig.contexts) {
      const availableContexts = kubeConfig.contexts.map(c => c.name)

      for (const supportedContext of supportedContexts) {
        if (availableContexts.includes(supportedContext)) {
          context = supportedContext
          logEntry.debug({ section: name, msg: `Using detected context: ${context}` })
          break
        }
      }
    }
  }

  if (!context) {
    context = supportedContexts[0]
    logEntry.debug({ section: name, msg: `No kubectl context auto-detected, using default: ${context}` })
  }

  if (context === "minikube") {
    await execa("minikube", ["config", "set", "WantUpdateNotification", "false"])

    if (!defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const minikubeIp = await execa.stdout("minikube", ["ip"])
      defaultHostname = `${projectName}.${minikubeIp}.nip.io`
    }

    await Promise.all([
      // TODO: wait for ingress addon to be ready, if it was previously disabled
      execa("minikube", ["addons", "enable", "ingress"]),
      setMinikubeDockerEnv(),
    ])

    systemServices = []
  } else {
    if (!defaultHostname) {
      defaultHostname = `${projectName}.local.app.garden`
    }
  }

  const k8sConfig: LocalKubernetesConfig = {
    name: config.name,
    context,
    defaultHostname,
    defaultUsername: "default",
    forceSsl: false,
    ingressHttpPort: 80,
    ingressHttpsPort: 443,
    ingressClass: "nginx",
    tlsCertificates: config.tlsCertificates,
    // TODO: support SSL on local deployments
    _system: config._system,
    _systemServices: systemServices,
  }

  const plugin = k8sPlugin({ config: k8sConfig })

  plugin.actions!.getEnvironmentStatus = getLocalEnvironmentStatus
  plugin.actions!.prepareEnvironment = configureLocalEnvironment

  return plugin
}
