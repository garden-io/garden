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
import * as split from "split"
import { uniq } from "lodash"
import moment = require("moment")

import { DeploymentError, NotFoundError, TimeoutError, ConfigurationError } from "../../exceptions"
import { GetServiceLogsResult, LoginStatus } from "../../types/plugin/outputs"
import { RunResult, TestResult } from "../../types/plugin/outputs"
import {
  ConfigureEnvironmentParams,
  DeleteConfigParams,
  DestroyEnvironmentParams,
  ExecInServiceParams,
  GetConfigParams,
  GetEnvironmentStatusParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetTestResultParams,
  PluginActionParamsBase,
  RunModuleParams,
  SetConfigParams,
  TestModuleParams,
  DeleteServiceParams,
} from "../../types/plugin/params"
import { ModuleVersion } from "../../vcs/base"
import { ContainerModule, helpers, parseContainerModule } from "../container"
import { deserializeValues, serializeValues, splitFirst, sleep } from "../../util/util"
import { joiIdentifier } from "../../config/common"
import { KubeApi } from "./api"
import {
  getAppNamespace,
  getMetadataNamespace,
  getAllGardenNamespaces,
} from "./namespace"
import { KUBECTL_DEFAULT_TIMEOUT, kubectl } from "./kubectl"
import { DEFAULT_TEST_TIMEOUT } from "../../constants"
import { EntryStyle, LogSymbolType } from "../../logger/types"
import { KubernetesProvider, name as providerName } from "./kubernetes"
import { deleteContainerService, getContainerServiceStatus } from "./deployment"
import { ServiceStatus } from "../../types/service"
import { ParseModuleParams } from "../../types/plugin/params"

const MAX_STORED_USERNAMES = 5

export async function parseModule(params: ParseModuleParams<ContainerModule>) {
  const config = await parseContainerModule(params)

  // validate endpoint specs
  const provider: KubernetesProvider = params.provider

  for (const serviceConfig of config.serviceConfigs) {
    for (const endpointSpec of serviceConfig.spec.endpoints) {
      const hostname = endpointSpec.hostname || provider.config.defaultHostname

      if (!hostname) {
        throw new ConfigurationError(
          `No hostname configured for one of the endpoints on service ${serviceConfig.name}. ` +
          `Please configure a default hostname or specify a hostname for the endpoint.`,
          {
            serviceName: serviceConfig.name,
            endpointSpec,
          },
        )
      }

      // make sure the hostname is set
      endpointSpec.hostname = hostname
    }
  }
}

export async function getEnvironmentStatus({ ctx, provider }: GetEnvironmentStatusParams) {
  const context = provider.config.context

  try {
    // TODO: use API instead of kubectl (I just couldn't find which API call to make)
    await kubectl(context).call(["version"])
  } catch (err) {
    // TODO: catch error properly
    if (err.detail.output) {
      throw new DeploymentError(
        `Unable to connect to Kubernetes cluster. ` +
        `Please make sure it is running, reachable and that you have the right context configured.`,
        {
          context,
          kubectlOutput: err.detail.output,
        },
      )
    }
    throw err
  }

  await Bluebird.all([
    getMetadataNamespace(ctx, provider),
    getAppNamespace(ctx, provider),
  ])

  return {
    configured: true,
    detail: <any>{},
  }
}

export async function configureEnvironment({ }: ConfigureEnvironmentParams) {
  // this happens implicitly in the `getEnvironmentStatus()` function
  return {}
}

export async function destroyEnvironment({ ctx, provider }: DestroyEnvironmentParams) {
  const api = new KubeApi(provider)
  const namespace = await getAppNamespace(ctx, provider)
  const entry = ctx.log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace} (this may take a while)`,
    entryStyle: EntryStyle.activity,
  })

  try {
    // Note: Need to call the delete method with an empty object
    // TODO: any cast is required until https://github.com/kubernetes-client/javascript/issues/52 is fixed
    await api.core.deleteNamespace(namespace, <any>{})
  } catch (err) {
    entry.setError(err.message)
    const availableNamespaces = await getAllGardenNamespaces(api)
    throw new NotFoundError(err, { namespace, availableNamespaces })
  }

  // Wait until namespace has been deleted
  const startTime = new Date().getTime()
  while (true) {
    await sleep(2000)

    const nsNames = await getAllGardenNamespaces(api)
    if (!nsNames.includes(namespace)) {
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

export async function deleteService(params: DeleteServiceParams): Promise<ServiceStatus> {
  const { ctx, logEntry, provider, service } = params
  const namespace = await getAppNamespace(ctx, provider)

  await deleteContainerService({ logEntry, namespace, provider, serviceName: service.name })

  return getContainerServiceStatus(params)
}

export async function getServiceOutputs({ service }: GetServiceOutputsParams<ContainerModule>) {
  return {
    host: service.name,
  }
}

export async function execInService(
  { ctx, provider, module, service, env, command, runtimeContext }: ExecInServiceParams<ContainerModule>,
) {
  const api = new KubeApi(provider)
  const status = await getContainerServiceStatus({ ctx, provider, module, service, env, runtimeContext })
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
  const podsRes = await api.core.listNamespacedPod(
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
  const kubecmd = ["exec", "-it", pod.metadata.name, "--", ...command]
  const res = await kubectl(api.context, namespace).tty(kubecmd, {
    ignoreError: true,
    silent: false,
    timeout: 999999,
    tty: true,
  })

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
  const version = module.version

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

  const api = new KubeApi(provider)

  // store test result
  const testResult: TestResult = {
    ...result,
    testName,
  }

  const ns = await getMetadataNamespace(ctx, provider)
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
    await api.core.createNamespacedConfigMap(ns, <any>body)
  } catch (err) {
    if (err.code === 409) {
      await api.core.patchNamespacedConfigMap(resultKey, ns, body)
    } else {
      throw err
    }
  }

  return testResult
}

export async function getTestResult(
  { ctx, provider, module, testName, version }: GetTestResultParams<ContainerModule>,
) {
  const api = new KubeApi(provider)
  const ns = await getMetadataNamespace(ctx, provider)
  const resultKey = getTestResultKey(module, testName, version)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, ns)
    return <TestResult>deserializeValues(res.body.data)
  } catch (err) {
    if (err.code === 404) {
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
  const api = new KubeApi(provider)
  const ns = await getMetadataNamespace(ctx, provider)

  try {
    const res = await api.core.readNamespacedSecret(key.join("."), ns)
    return { value: Buffer.from(res.body.data.value, "base64").toString() }
  } catch (err) {
    if (err.code === 404) {
      return { value: null }
    } else {
      throw err
    }
  }
}

export async function setConfig({ ctx, provider, key, value }: SetConfigParams) {
  // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
  const api = new KubeApi(provider)
  const ns = await getMetadataNamespace(ctx, provider)
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
    await api.core.createNamespacedSecret(ns, <any>body)
  } catch (err) {
    if (err.code === 409) {
      await api.core.patchNamespacedSecret(name, ns, body)
    } else {
      throw err
    }
  }

  return {}
}

export async function deleteConfig({ ctx, provider, key }: DeleteConfigParams) {
  const api = new KubeApi(provider)
  const ns = await getMetadataNamespace(ctx, provider)
  const name = key.join(".")

  try {
    await api.core.deleteNamespacedSecret(name, ns, <any>{})
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
  const newPrevUsernames = uniq([...prevUsernames, username].slice(-MAX_STORED_USERNAMES))

  await ctx.localConfigStore.set([
    { keyPath: [providerName, "username"], value: username },
    { keyPath: [providerName, "previous-usernames"], value: newPrevUsernames },
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
