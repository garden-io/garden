/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as inquirer from "inquirer"
import * as Joi from "joi"

import { DeploymentError, NotFoundError } from "../../exceptions"
import {
  ConfigureEnvironmentParams,
  DeleteConfigParams,
  DestroyEnvironmentParams,
  ExecInServiceParams,
  GetConfigParams,
  GetEnvironmentStatusParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  GetTestResultParams,
  LoginStatus,
  PluginActionParamsBase,
  SetConfigParams,
  TestModuleParams,
  TestResult,
} from "../../types/plugin"
import { TreeVersion } from "../../vcs/base"
import {
  ContainerModule,
} from "../container"
import { values, every, uniq } from "lodash"
import { deserializeKeys, prompt, serializeKeys, splitFirst } from "../../util"
import { ServiceStatus } from "../../types/service"
import { joiIdentifier } from "../../types/common"
import {
  apiGetOrNull,
  apiPostOrPut,
  coreApi,
} from "./api"
import {
  createNamespace,
  getAppNamespace,
  getMetadataNamespace,
  getAllAppNamespaces,
} from "./namespace"
import {
  kubectl,
} from "./kubectl"
import { DEFAULT_TEST_TIMEOUT } from "../../constants"
import * as split from "split"
import moment = require("moment")
import { EntryStyle, LogSymbolType } from "../../logger/types"
import {
  checkDeploymentStatus,
} from "./status"

import { name as providerName } from "./index"

const MAX_STORED_USERNAMES = 5

export async function getEnvironmentStatus({ ctx, provider }: GetEnvironmentStatusParams) {
  const context = provider.config.context

  try {
    // TODO: use API instead of kubectl (I just couldn't find which API call to make)
    await kubectl(context).call(["version"])
  } catch (err) {
    // TODO: catch error properly
    if (err.output) {
      throw new DeploymentError(
        `Unable to connect to Kubernetes cluster. ` +
        `Please make sure it is running, reachable and that you have the right context configured.`,
        {
          context,
          kubectlOutput: err.output,
        },
      )
    }
    throw err
  }

  const statusDetail: { [key: string]: boolean } = {
    namespaceReady: false,
    metadataNamespaceReady: false,
  }

  const metadataNamespace = getMetadataNamespace(ctx, provider)
  const namespacesStatus = await coreApi(context).namespaces().get()
  const namespace = await getAppNamespace(ctx, provider)

  for (const n of namespacesStatus.items) {
    if (n.metadata.name === namespace && n.status.phase === "Active") {
      statusDetail.namespaceReady = true
    }

    if (n.metadata.name === metadataNamespace && n.status.phase === "Active") {
      statusDetail.metadataNamespaceReady = true
    }
  }

  let configured = every(values(statusDetail))

  return {
    configured,
    detail: statusDetail,
  }
}

export async function configureEnvironment(
  { ctx, provider, status, logEntry }: ConfigureEnvironmentParams,
) {
  const context = provider.config.context

  if (!status.detail.namespaceReady) {
    const ns = await getAppNamespace(ctx, provider)
    logEntry && logEntry.setState({ section: "kubernetes", msg: `Creating namespace ${ns}` })
    await createNamespace(context, ns)
  }

  if (!status.detail.metadataNamespaceReady) {
    const ns = getMetadataNamespace(ctx, provider)
    logEntry && logEntry.setState({ section: "kubernetes", msg: `Creating namespace ${ns}` })
    await createNamespace(context, ns)
  }
}

export async function getServiceStatus(params: GetServiceStatusParams<ContainerModule>): Promise<ServiceStatus> {
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  return await checkDeploymentStatus(params)
}

export async function destroyEnvironment({ ctx, provider }: DestroyEnvironmentParams) {
  const context = provider.config.context
  const namespace = await getAppNamespace(ctx, provider)
  const entry = ctx.log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace}`,
    entryStyle: EntryStyle.activity,
  })
  try {
    await coreApi(context).namespace(namespace).delete(namespace)
    entry.setSuccess("Finished")
  } catch (err) {
    entry.setError(err.message)
    const availableNamespaces = getAllAppNamespaces(context)
    throw new NotFoundError(err, { namespace, availableNamespaces })
  }
}

export async function getServiceOutputs({ service }: GetServiceOutputsParams<ContainerModule>) {
  return {
    host: service.name,
  }
}

export async function execInService(
  { ctx, provider, service, env, command }: ExecInServiceParams<ContainerModule>,
) {
  const context = provider.config.context
  const status = await getServiceStatus({ ctx, provider, service, env })
  const namespace = await getAppNamespace(ctx, provider)

  // TODO: this check should probably live outside of the plugin
  if (!status.state || status.state !== "ready") {
    throw new DeploymentError(`Service ${service.name} is not running`, {
      name: service.name,
      state: status.state,
    })
  }

  // get a running pod
  let res = await coreApi(context, namespace).namespaces.pods.get({
    qs: {
      labelSelector: `service=${service.name}`,
    },
  })
  const pod = res.items[0]

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError(`Could not find running pod for ${service.name}`, {
      serviceName: service.name,
    })
  }

  // exec in the pod via kubectl
  res = await kubectl(context, namespace).tty(["exec", "-it", pod.metadata.name, "--", ...command])

  return { code: res.code, output: res.output }
}

export async function testModule(
  { ctx, provider, module, testName, testSpec, runtimeContext }: TestModuleParams<ContainerModule>,
): Promise<TestResult> {
  const context = provider.config.context
  const baseEnv = {}
  const envVars = { ...baseEnv, ...runtimeContext.envVars, ...testSpec.variables }
  const envArgs = Object.entries(envVars).map(([v, k]) => `--env=${k}=${v}`)

  // TODO: use the runModule() method
  const testCommandStr = testSpec.command.join(" ")
  const image = await module.getLocalImageId()
  const version = await module.getVersion()

  const kubecmd = [
    "run", `run-${module.name}-${Math.round(new Date().getTime())}`,
    `--image=${image}`,
    "--restart=Never",
    "--command",
    "-i",
    "--tty",
    "--rm",
    ...envArgs,
    "--",
    "/bin/sh",
    "-c",
    testCommandStr,
  ]

  const startedAt = new Date()

  const timeout = testSpec.timeout || DEFAULT_TEST_TIMEOUT
  const res = await kubectl(context, await getAppNamespace(ctx, provider)).tty(kubecmd, { ignoreError: true, timeout })

  const testResult: TestResult = {
    moduleName: module.name,
    testName,
    version,
    success: res.code === 0,
    startedAt,
    completedAt: new Date(),
    output: res.output,
  }

  const ns = getMetadataNamespace(ctx, provider)
  const resultKey = getTestResultKey(module, testName, version)
  const body = {
    body: {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: resultKey,
        annotations: {
          "garden.io/generated": "true",
        },
      },
      type: "generic",
      data: serializeKeys(testResult),
    },
  }

  await apiPostOrPut(coreApi(context, ns).namespaces.configmaps, resultKey, body)

  return testResult
}

export async function getTestResult(
  { ctx, provider, module, testName, version }: GetTestResultParams<ContainerModule>,
) {
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  const resultKey = getTestResultKey(module, testName, version)
  const res = await apiGetOrNull(coreApi(context, ns).namespaces.configmaps, resultKey)
  return res && <TestResult>deserializeKeys(res.data)
}

export async function getServiceLogs(
  { ctx, provider, service, stream, tail }: GetServiceLogsParams<ContainerModule>,
) {
  const context = provider.config.context
  const resourceType = service.config.daemon ? "daemonset" : "deployment"

  const kubectlArgs = ["logs", `${resourceType}/${service.name}`, "--timestamps=true"]

  if (tail) {
    kubectlArgs.push("--follow")
  }

  const namespace = await getAppNamespace(ctx, provider)
  const proc = kubectl(context, namespace).spawn(kubectlArgs)

  proc.stdout
    .pipe(split())
    .on("data", (s) => {
      if (!s) {
        return
      }
      const [timestampStr, msg] = splitFirst(s, " ")
      const timestamp = moment(timestampStr)
      stream.write({ serviceName: service.name, timestamp, msg })
    })

  proc.stderr.pipe(process.stderr)

  return new Promise<void>((resolve, reject) => {
    proc.on("error", reject)

    proc.on("exit", () => {
      resolve()
    })
  })
}

export async function getConfig({ ctx, provider, key }: GetConfigParams) {
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  const res = await apiGetOrNull(coreApi(context, ns).namespaces.secrets, key.join("."))
  return res && Buffer.from(res.data.value, "base64").toString()
}

export async function setConfig({ ctx, provider, key, value }: SetConfigParams) {
  // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  const body = {
    body: {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: key,
        annotations: {
          "garden.io/generated": "true",
        },
      },
      type: "generic",
      stringData: { value },
    },
  }

  await apiPostOrPut(coreApi(context, ns).namespaces.secrets, key.join("."), body)
}

export async function deleteConfig({ ctx, provider, key }: DeleteConfigParams) {
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  try {
    await coreApi(context, ns).namespaces.secrets(key.join(".")).delete()
  } catch (err) {
    if (err.code === 404) {
      return { found: false }
    } else {
      throw err
    }
  }
  return { found: true }
}

export async function getLoginStatus({ ctx }: PluginActionParamsBase): Promise<LoginStatus> {
  const localConfig = await ctx.localConfigStore.get()
  let currentUsername
  if (localConfig.kubernetes) {
    currentUsername = localConfig.kubernetes.username
  }
  return { loggedIn: !!currentUsername }
}

export async function login({ ctx }: PluginActionParamsBase): Promise<LoginStatus> {
  const entry = ctx.log.info({ section: "kubernetes", msg: "Logging in..." })
  const localConfig = await ctx.localConfigStore.get()

  let currentUsername
  let prevUsernames: Array<string> = []

  if (localConfig.kubernetes) {
    currentUsername = localConfig.kubernetes.username
    prevUsernames = localConfig.kubernetes["previous-usernames"] || []
  }

  if (currentUsername) {
    entry.setDone({
      symbol: LogSymbolType.info,
      msg: `Already logged in as user ${currentUsername}`,
    })

    return { loggedIn: true }
  }

  const promptName = "username"
  const newUserOption = "Add new user"
  type Ans = { [promptName]: string }
  let ans: Ans

  const inputPrompt = async () => {
    return prompt({
      name: promptName,
      message: "Enter username",
      validate: input => {
        try {
          Joi.attempt(input.trim(), joiIdentifier())
        } catch (err) {
          return `Invalid username, please try again\nError: ${err.message}`
        }
        return true
      },
    })
  }
  const choicesPrompt = async () => {
    return prompt({
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
  const newPrevUsernams = uniq([...prevUsernames, username].slice(-MAX_STORED_USERNAMES))

  await ctx.localConfigStore.set([
    { keyPath: [providerName, "username"], value: username },
    { keyPath: [providerName, "previous-usernames"], value: newPrevUsernams },
  ])

  return { loggedIn: true }
}

export async function logout({ ctx }: PluginActionParamsBase): Promise<LoginStatus> {
  const entry = ctx.log.info({ section: "kubernetes", msg: "Logging out..." })
  const localConfig = await ctx.localConfigStore.get()
  const k8sConfig = localConfig.kubernetes || {}
  if (k8sConfig.username) {
    await ctx.localConfigStore.delete([providerName, "username"])
    entry.setSuccess("Logged out")
  } else {
    entry.setSuccess("Already logged out")
  }
  return { loggedIn: false }
}

function getTestResultKey(module: ContainerModule, testName: string, version: TreeVersion) {
  return `test-result--${module.name}--${testName}--${version.versionString}`
}
