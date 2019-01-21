/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import * as inquirer from "inquirer"
import * as Joi from "joi"
import { uniq, every, values, pick, find } from "lodash"

import { DeploymentError, NotFoundError, TimeoutError, PluginError } from "../../exceptions"
import {
  PrepareEnvironmentParams,
  CleanupEnvironmentParams,
  GetEnvironmentStatusParams,
  PluginActionParamsBase,
} from "../../types/plugin/params"
import { sleep } from "../../util/util"
import { joiUserIdentifier } from "../../config/common"
import { KubeApi } from "./api"
import {
  getAppNamespace,
  getMetadataNamespace,
  getAllNamespaces,
} from "./namespace"
import { KUBECTL_DEFAULT_TIMEOUT, kubectl } from "./kubectl"
import { name as providerName, KubernetesProvider } from "./kubernetes"
import { isSystemGarden, getSystemGarden } from "./system"
import { PluginContext } from "../../plugin-context"
import { LogEntry } from "../../logger/log-entry"
import { DashboardPage } from "../../config/dashboard"
import { checkTillerStatus, installTiller } from "./helm/tiller"

const MAX_STORED_USERNAMES = 5

/**
 * Used by both the remote and local plugin
 */
async function prepareNamespaces({ ctx }: GetEnvironmentStatusParams) {
  const kubeContext = ctx.provider.config.context

  try {
    // TODO: use API instead of kubectl (I just couldn't find which API call to make)
    await kubectl(kubeContext).call(["version"])
  } catch (err) {
    // TODO: catch error properly
    if (err.detail.output) {
      throw new DeploymentError(
        `Unable to connect to Kubernetes cluster. ` +
        `Please make sure it is running, reachable and that you have the right context configured.`,
        {
          kubeContext,
          kubectlOutput: err.detail.output,
        },
      )
    }
    throw err
  }

  await Bluebird.all([
    getMetadataNamespace(ctx, ctx.provider),
    getAppNamespace(ctx, ctx.provider),
  ])
}

export async function getRemoteEnvironmentStatus({ ctx, log }: GetEnvironmentStatusParams) {
  const loggedIn = await getLoginStatus({ ctx, log })

  if (!loggedIn) {
    return {
      ready: false,
      needUserInput: true,
    }
  }

  await prepareNamespaces({ ctx, log })

  const ready = (await checkTillerStatus(ctx, ctx.provider, log)) === "ready"

  return {
    ready,
    needUserInput: false,
  }
}

export async function getLocalEnvironmentStatus({ ctx, log }: GetEnvironmentStatusParams) {
  let ready = true
  let needUserInput = false
  const dashboardPages: DashboardPage[] = []

  await prepareNamespaces({ ctx, log })

  if (!isSystemGarden(ctx.provider)) {
    // Check if system services are deployed
    const sysGarden = await getSystemGarden(ctx.provider)
    const sysCtx = await sysGarden.getPluginContext(ctx.provider.name)
    const sysStatus = await sysGarden.actions.getStatus({ log })

    const serviceStatuses = pick(sysStatus.services, getSystemServices(ctx.provider))

    const servicesReady = every(values(serviceStatuses).map(s => s.state === "ready"))
    const systemReady = sysStatus.providers[ctx.provider.config.name].ready && servicesReady

    if (!systemReady) {
      ready = false
    }

    // Check Tiller status
    if (await checkTillerStatus(ctx, ctx.provider, log) !== "ready") {
      ready = false
    }

    if (await checkTillerStatus(sysCtx, sysCtx.provider, log) !== "ready") {
      ready = false
    }

    // Add the Kubernetes dashboard to the Garden dashboard
    const namespace = await getAppNamespace(ctx, ctx.provider)
    const defaultHostname = ctx.provider.config.defaultHostname

    const dashboardStatus = sysStatus.services["kubernetes-dashboard"]
    const dashboardServiceResource = find(
      (dashboardStatus.detail || {}).remoteObjects,
      o => o.kind === "Service",
    )

    if (!!dashboardServiceResource) {
      const dashboardPort = dashboardServiceResource.spec.ports[0].nodePort

      if (!!dashboardPort) {
        dashboardPages.push({
          title: "Kubernetes",
          description: "The standard Kubernetes dashboard for this project",
          url: `https://${defaultHostname}:${dashboardPort}/#!/workload?namespace=${namespace}`,
          newWindow: true,
        })
      }
    }
  }

  return {
    ready,
    needUserInput,
    dashboardPages,
  }
}

export async function prepareRemoteEnvironment({ ctx, log }: PrepareEnvironmentParams) {
  const loggedIn = await getLoginStatus({ ctx, log })

  if (!loggedIn) {
    await login({ ctx, log })
  }

  await installTiller(ctx, ctx.provider, log)

  return {}
}

export async function prepareLocalEnvironment({ ctx, force, log }: PrepareEnvironmentParams) {
  // make sure system services are deployed
  if (!isSystemGarden(ctx.provider)) {
    await configureSystemServices({ ctx, force, log })
    await installTiller(ctx, ctx.provider, log)
  }

  return {}
}

export async function cleanupEnvironment({ ctx, log }: CleanupEnvironmentParams) {
  const api = new KubeApi(ctx.provider)
  const namespace = await getAppNamespace(ctx, ctx.provider)
  const entry = log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace} (this may take a while)`,
    status: "active",
  })

  try {
    // Note: Need to call the delete method with an empty object
    // TODO: any cast is required until https://github.com/kubernetes-client/javascript/issues/52 is fixed
    await api.core.deleteNamespace(namespace, <any>{})
  } catch (err) {
    entry.setError(err.message)
    const availableNamespaces = await getAllNamespaces(api)
    throw new NotFoundError(err, { namespace, availableNamespaces })
  }

  await logout({ ctx, log })

  // Wait until namespace has been deleted
  const startTime = new Date().getTime()
  while (true) {
    await sleep(2000)

    const nsNames = await getAllNamespaces(api)
    if (!nsNames.includes(namespace)) {
      entry.setSuccess()
      break
    }

    const now = new Date().getTime()
    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new TimeoutError(
        `Timed out waiting for namespace ${namespace} delete to complete`,
        { namespace },
      )
    }
  }

  return {}
}

async function getLoginStatus({ ctx }: PluginActionParamsBase) {
  const localConfig = await ctx.localConfigStore.get()
  let currentUsername
  if (localConfig.kubernetes) {
    currentUsername = localConfig.kubernetes.username
  }
  return !!currentUsername
}

async function login({ ctx, log }: PluginActionParamsBase) {
  const entry = log.info({ section: "kubernetes", msg: "Logging in..." })
  const localConfig = await ctx.localConfigStore.get()

  let currentUsername
  let prevUsernames: Array<string> = []

  if (localConfig.kubernetes) {
    currentUsername = localConfig.kubernetes.username
    prevUsernames = localConfig.kubernetes["previous-usernames"] || []
  }

  if (currentUsername) {
    entry && entry.setDone({
      symbol: "info",
      msg: `Already logged in as user ${currentUsername}`,
    })

    return { loggedIn: true }
  }

  const promptName = "username"
  const newUserOption = "Add new user"
  type Ans = { [promptName]: string }
  let ans: Ans

  const inputPrompt = async () => {
    return inquirer.prompt({
      name: promptName,
      message: "Enter username",
      validate: input => {
        try {
          Joi.attempt(input.trim(), joiUserIdentifier())
        } catch (err) {
          return `Invalid username, please try again\nError: ${err.message}`
        }
        return true
      },
    })
  }
  const choicesPrompt = async () => {
    return inquirer.prompt({
      name: promptName,
      type: "list",
      message: "Log in as...",
      choices: [...prevUsernames, new inquirer.Separator(), newUserOption],
    })
  }
  if (prevUsernames.length > 0) {
    ans = await choicesPrompt() as Ans
    if (ans.username === newUserOption) {
      ans = await inputPrompt() as Ans
    }
  } else {
    ans = await inputPrompt() as Ans
  }

  const username = ans.username.trim()
  const newPrevUsernames = uniq([...prevUsernames, username].slice(-MAX_STORED_USERNAMES))

  await ctx.localConfigStore.set([
    { keyPath: [providerName, "username"], value: username },
    { keyPath: [providerName, "previous-usernames"], value: newPrevUsernames },
  ])

  return { loggedIn: true }
}

async function logout({ ctx, log }: PluginActionParamsBase) {
  const entry = log.info({ section: "kubernetes", msg: "Logging out..." })
  const localConfig = await ctx.localConfigStore.get()
  const k8sConfig = localConfig.kubernetes || {}

  if (k8sConfig.username) {
    await ctx.localConfigStore.delete([providerName, "username"])
    entry && entry.setSuccess("Logged out")
  } else {
    entry && entry.setSuccess("Already logged out")
  }
}

async function configureSystemServices(
  { ctx, force, log }:
    { ctx: PluginContext, force: boolean, log: LogEntry },
) {
  const provider = ctx.provider
  const sysGarden = await getSystemGarden(provider)
  const sysCtx = sysGarden.getPluginContext(provider.name)

  const sysStatus = await getLocalEnvironmentStatus({
    ctx: sysCtx,
    log,
  })

  await installTiller(sysCtx, sysCtx.provider, log)

  await prepareLocalEnvironment({
    ctx: sysCtx,
    force,
    status: sysStatus,
    log,
  })

  // only deploy services if configured to do so (e.g. minikube bundles some required services as addons)
  const systemServices = getSystemServices(ctx.provider)

  if (systemServices.length > 0) {
    const results = await sysGarden.actions.deployServices({
      log,
      serviceNames: systemServices,
      force,
    })

    const failed = values(results.taskResults).filter(r => !!r.error).length

    if (failed) {
      throw new PluginError(`local-kubernetes: ${failed} errors occurred when configuring environment`, {
        results,
      })
    }
  }
}

function getSystemServices(provider: KubernetesProvider) {
  const names = ["kubernetes-dashboard"]

  if (provider.config.setupIngressController === "nginx") {
    names.push("ingress-controller", "default-backend")
  }

  return names
}
