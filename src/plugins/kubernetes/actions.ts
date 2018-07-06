/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as inquirer from "inquirer"
import * as Joi from "joi"

import { DeploymentError, NotFoundError, TimeoutError } from "../../exceptions"
import {
  GetServiceLogsResult,
  LoginStatus,
} from "../../types/plugin/outputs"
import {
  RunResult,
  TestResult,
} from "../../types/plugin/outputs"
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
  PluginActionParamsBase,
  RunModuleParams,
  SetConfigParams,
  TestModuleParams,
} from "../../types/plugin/params"
import { ModuleVersion } from "../../vcs/base"
import {
  ContainerModule,
  helpers,
} from "../container"
import { values, every, uniq } from "lodash"
import { deserializeValues, serializeValues, splitFirst, sleep } from "../../util/util"
import { ServiceStatus } from "../../types/service"
import { joiIdentifier } from "../../types/common"
import {
  coreApi,
} from "./api"
import {
  createNamespace,
  getAppNamespace,
  getMetadataNamespace,
  getAllGardenNamespaces,
} from "./namespace"
import {
  KUBECTL_DEFAULT_TIMEOUT,
  kubectl,
} from "./kubectl"
import { DEFAULT_TEST_TIMEOUT } from "../../constants"
import * as split from "split"
import moment = require("moment")
import { EntryStyle, LogSymbolType } from "../../logger/types"
import {
  checkDeploymentStatus,
} from "./status"

import { name as providerName } from "./kubernetes"

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
  const namespacesStatus = await coreApi(context).listNamespace()
  const namespace = await getAppNamespace(ctx, provider)

  for (const n of namespacesStatus.body.items) {
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

  return {}
}

export async function getServiceStatus(params: GetServiceStatusParams<ContainerModule>): Promise<ServiceStatus> {
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  return await checkDeploymentStatus(params)
}

export async function destroyEnvironment({ ctx, provider }: DestroyEnvironmentParams) {
  const { context } = provider.config
  const namespace = await getAppNamespace(ctx, provider)
  const entry = ctx.log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace} (this can take awhile)`,
    entryStyle: EntryStyle.activity,
  })

  try {
    // Note: Need to call the delete method with an empty object
    // TODO: any cast is required until https://github.com/kubernetes-client/javascript/issues/52 is fixed
    await coreApi(context).deleteNamespace(namespace, <any>{})
  } catch (err) {
    entry.setError(err.message)
    const availableNamespaces = await getAllGardenNamespaces(context)
    throw new NotFoundError(err, { namespace, availableNamespaces })
  }

  // Wait until namespace has been deleted
  const startTime = new Date().getTime()
  while (true) {
    await sleep(2000)

    const nsNames = await getAllGardenNamespaces(context)
    if (!nsNames.includes(namespace)) {
      break
    }

    const now = new Date().getTime()
    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new TimeoutError(
        `Timed out waiting for namespace ${namespace} delete to complete`,
        { status },
      )
    }
  }

  return {}
}

export async function getServiceOutputs({ service }: GetServiceOutputsParams<ContainerModule>) {
  return {
    host: service.name,
  }
}

export async function execInService(
  { ctx, provider, module, service, env, command }: ExecInServiceParams<ContainerModule>,
) {
  const context = provider.config.context
  const status = await getServiceStatus({ ctx, provider, module, service, env })
  const namespace = await getAppNamespace(ctx, provider)

  // TODO: this check should probably live outside of the plugin
  if (!status.state || status.state !== "ready") {
    throw new DeploymentError(`Service ${service.name} is not running`, {
      name: service.name,
      state: status.state,
    })
  }

  // get a running pod
  // NOTE: the awkward function signature called out here: https://github.com/kubernetes-client/javascript/issues/53
  const podsRes = await coreApi(context).listNamespacedPod(
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    `service=${service.name}`,
  )
  const pod = podsRes.body.items[0]

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError(`Could not find running pod for ${service.name}`, {
      serviceName: service.name,
    })
  }

  // exec in the pod via kubectl
  const res = await kubectl(context, namespace).tty(["exec", "-it", pod.metadata.name, "--", ...command])

  return { code: res.code, output: res.output }
}

export async function runModule(
  { ctx, provider, module, command, interactive, runtimeContext, silent, timeout }: RunModuleParams<ContainerModule>,
): Promise<RunResult> {
  const context = provider.config.context
  const namespace = await getAppNamespace(ctx, provider)

  const envArgs = Object.entries(runtimeContext.envVars).map(([k, v]) => `--env=${k}=${v}`)

  const commandStr = command.join(" ")
  const image = await helpers.getLocalImageId(module)
  const version = await module.getVersion()

  const opts = [
    `--image=${image}`,
    "--restart=Never",
    "--command",
    "--tty",
    "--rm",
    "-i",
    "--quiet",
  ]

  const kubecmd = [
    "run", `run-${module.name}-${Math.round(new Date().getTime())}`,
    ...opts,
    ...envArgs,
    "--",
    "/bin/sh",
    "-c",
    commandStr,
  ]

  const startedAt = new Date()

  const res = await kubectl(context, namespace).tty(kubecmd, {
    ignoreError: true,
    silent: !interactive || silent, // shouldn't be silent in interactive mode
    timeout,
    tty: interactive,
  })

  return {
    moduleName: module.name,
    command,
    version,
    success: res.code === 0,
    startedAt,
    completedAt: new Date(),
    output: res.output,
  }
}

export async function testModule(
  { ctx, provider, env, interactive, module, runtimeContext, silent, testConfig }:
    TestModuleParams<ContainerModule>,
): Promise<TestResult> {
  const testName = testConfig.name
  const command = testConfig.spec.command
  runtimeContext.envVars = { ...runtimeContext.envVars, ...testConfig.spec.env }
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runModule({ ctx, provider, env, module, command, interactive, runtimeContext, silent, timeout })

  const context = provider.config.context

  // store test result
  const testResult: TestResult = {
    ...result,
    testName,
  }

  const ns = getMetadataNamespace(ctx, provider)
  const resultKey = getTestResultKey(module, testName, result.version)
  const body = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: resultKey,
      annotations: {
        "garden.io/generated": "true",
      },
    },
    data: serializeValues(testResult),
  }

  try {
    await coreApi(context).createNamespacedConfigMap(ns, <any>body)
  } catch (err) {
    if (err.response && err.response.statusCode === 409) {
      await coreApi(context).patchNamespacedConfigMap(resultKey, ns, body)
    } else {
      throw err
    }
  }

  return testResult
}

export async function getTestResult(
  { ctx, provider, module, testName, version }: GetTestResultParams<ContainerModule>,
) {
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  const resultKey = getTestResultKey(module, testName, version)

  try {
    const res = await coreApi(context).readNamespacedConfigMap(resultKey, ns)
    return <TestResult>deserializeValues(res.body.data)
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

export async function getServiceLogs(
  { ctx, provider, service, stream, tail }: GetServiceLogsParams<ContainerModule>,
) {
  const context = provider.config.context
  const resourceType = service.spec.daemon ? "daemonset" : "deployment"

  const kubectlArgs = ["logs", `${resourceType}/${service.name}`, "--timestamps=true"]

  if (tail) {
    kubectlArgs.push("--follow")
  }

  const namespace = await getAppNamespace(ctx, provider)
  const proc = kubectl(context, namespace).spawn(kubectlArgs)
  let timestamp: Date

  proc.stdout
    .pipe(split())
    .on("data", (s) => {
      if (!s) {
        return
      }
      const [timestampStr, msg] = splitFirst(s, " ")
      try {
        timestamp = moment(timestampStr).toDate()
      } catch { }
      stream.write({ serviceName: service.name, timestamp, msg })
    })

  proc.stderr.pipe(process.stderr)

  return new Promise<GetServiceLogsResult>((resolve, reject) => {
    proc.on("error", reject)

    proc.on("exit", () => {
      resolve({})
    })
  })
}

export async function getConfig({ ctx, provider, key }: GetConfigParams) {
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)

  try {
    const res = await coreApi(context).readNamespacedSecret(key.join("."), ns)
    return { value: Buffer.from(res.body.data.value, "base64").toString() }
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
      return { value: null }
    } else {
      throw err
    }
  }
}

export async function setConfig({ ctx, provider, key, value }: SetConfigParams) {
  // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  const name = key.join(".")
  const body = {
    body: {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name,
        annotations: {
          "garden.io/generated": "true",
        },
      },
      type: "generic",
      stringData: { value },
    },
  }

  try {
    await coreApi(context).createNamespacedSecret(ns, <any>body)
  } catch (err) {
    if (err.response && err.response.statusCode === 409) {
      await coreApi(context).patchNamespacedSecret(name, ns, body)
    } else {
      throw err
    }
  }

  return {}
}

export async function deleteConfig({ ctx, provider, key }: DeleteConfigParams) {
  const context = provider.config.context
  const ns = getMetadataNamespace(ctx, provider)
  const name = key.join(".")

  try {
    await coreApi(context).deleteNamespacedSecret(name, ns, <any>{})
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
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
    return inquirer.prompt({
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

function getTestResultKey(module: ContainerModule, testName: string, version: ModuleVersion) {
  return `test-result--${module.name}--${testName}--${version.versionString}`
}
