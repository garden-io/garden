/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import * as execa from "execa"
import * as split from "split"
import { includes } from "lodash"
import moment = require("moment")

import { DeploymentError, ConfigurationError } from "../../exceptions"
import { GetServiceLogsResult, HotReloadResult, RunResult, TestResult } from "../../types/plugin/outputs"
import {
  ExecInServiceParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetTestResultParams,
  HotReloadParams,
  RunModuleParams,
  TestModuleParams,
  DeleteServiceParams,
  RunServiceParams,
} from "../../types/plugin/params"
import { ModuleVersion } from "../../vcs/base"
import { ContainerModule, helpers, validateContainerModule } from "../container"
import { deserializeValues, serializeValues, splitFirst } from "../../util/util"
import { KubeApi } from "./api"
import { getAppNamespace, getMetadataNamespace } from "./namespace"
import { kubectl } from "./kubectl"
import { DEFAULT_TEST_TIMEOUT } from "../../constants"
import {
  getContainerServiceStatus,
  deleteContainerService,
  rsyncSourcePath,
  rsyncTargetPath,
} from "./deployment"
import { KubernetesProvider } from "./kubernetes"
import { getIngresses } from "./ingress"
import { rsyncPortName } from "./service"
import { ServiceStatus } from "../../types/service"
import { ValidateModuleParams } from "../../types/plugin/params"
import { waitForServices } from "./status"

export async function validate(params: ValidateModuleParams<ContainerModule>) {
  const config = await validateContainerModule(params)

  // validate ingress specs
  const provider: KubernetesProvider = params.ctx.provider

  for (const serviceConfig of config.serviceConfigs) {
    for (const ingressSpec of serviceConfig.spec.ingresses) {
      const hostname = ingressSpec.hostname || provider.config.defaultHostname

      if (!hostname) {
        throw new ConfigurationError(
          `No hostname configured for one of the ingresses on service ${serviceConfig.name}. ` +
          `Please configure a default hostname or specify a hostname for the ingress.`,
          {
            serviceName: serviceConfig.name,
            ingressSpec,
          },
        )
      }

      // make sure the hostname is set
      ingressSpec.hostname = hostname
    }
  }
}

export async function deleteService(params: DeleteServiceParams): Promise<ServiceStatus> {
  const { ctx, logEntry, service } = params
  const namespace = await getAppNamespace(ctx, ctx.provider)
  const provider = ctx.provider

  await deleteContainerService(
    { provider, namespace, serviceName: service.name, logEntry })

  return getContainerServiceStatus(params)
}

export async function getServiceOutputs({ service }: GetServiceOutputsParams<ContainerModule>) {
  return {
    host: service.name,
  }
}

export async function execInService(params: ExecInServiceParams<ContainerModule>) {
  const { ctx, service, command, interactive } = params
  const api = new KubeApi(ctx.provider)
  const status = await getContainerServiceStatus(params)
  const namespace = await getAppNamespace(ctx, ctx.provider)

  // TODO: this check should probably live outside of the plugin
  if (!includes(["ready", "outdated"], status.state)) {
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
  const kubecmd = ["exec", "-i", pod.metadata.name, "--", ...command]
  const res = await kubectl(api.context, namespace).call(kubecmd, {
    ignoreError: true,
    timeout: 999999,
    tty: interactive,
  })

  return { code: res.code, output: res.output }
}

export async function hotReload(
  { ctx, runtimeContext, module, buildDependencies }: HotReloadParams<ContainerModule>,
): Promise<HotReloadResult> {
  const hotReloadConfig = module.spec.hotReload!

  const services = module.services

  if (!await waitForServices(ctx, runtimeContext, services, buildDependencies)) {
    // Service deployment timed out, skip hot reload
    return {}
  }

  const api = new KubeApi(ctx.provider)

  const namespace = await getAppNamespace(ctx, ctx.provider)

  await Bluebird.map(services, async (service) => {

    const hostname = (await getIngresses(service, api))[0].hostname

    const rsyncNodePort = (await api.core
      .readNamespacedService(service.name + "-nodeport", namespace))
      .body.spec.ports.find(p => p.name === rsyncPortName(service.name))!
      .nodePort

    await Bluebird.map(hotReloadConfig.sync, async ({ source, target }) => {
      const src = rsyncSourcePath(module, source)
      const destination = `rsync://${hostname}:${rsyncNodePort}/volume/${rsyncTargetPath(target)}`
      await execa("rsync", ["-vrptgo", src, destination])
    })
  })

  return {}
}

export async function runModule(
  { ctx, module, command, interactive, runtimeContext, timeout }: RunModuleParams<ContainerModule>,
): Promise<RunResult> {
  const context = ctx.provider.config.context
  const namespace = await getAppNamespace(ctx, ctx.provider)

  const envArgs = Object.entries(runtimeContext.envVars).map(([k, v]) => `--env=${k}=${v}`)

  const commandStr = command.join(" ")
  const image = await helpers.getLocalImageId(module)
  const version = module.version

  const opts = [
    `--image=${image}`,
    "--restart=Never",
    "--command",
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

  const res = await kubectl(context, namespace).call(kubecmd, {
    ignoreError: true,
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

export async function runService(
  { ctx, service, interactive, runtimeContext, timeout, logEntry, buildDependencies }:
    RunServiceParams<ContainerModule>,
) {
  return runModule({
    ctx,
    module: service.module,
    command: service.spec.command || [],
    interactive,
    runtimeContext,
    timeout,
    logEntry,
    buildDependencies,
  })
}

export async function testModule(
  { ctx, interactive, module, runtimeContext, testConfig, logEntry, buildDependencies }:
    TestModuleParams<ContainerModule>,
): Promise<TestResult> {
  const testName = testConfig.name
  const command = testConfig.spec.command
  runtimeContext.envVars = { ...runtimeContext.envVars, ...testConfig.spec.env }
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runModule({
    ctx,
    module,
    command,
    interactive,
    runtimeContext,
    timeout,
    logEntry,
    buildDependencies,
  })

  const api = new KubeApi(ctx.provider)

  // store test result
  const testResult: TestResult = {
    ...result,
    testName,
  }

  const ns = await getMetadataNamespace(ctx, ctx.provider)
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
  { ctx, module, testName, version }: GetTestResultParams<ContainerModule>,
) {
  const api = new KubeApi(ctx.provider)
  const ns = await getMetadataNamespace(ctx, ctx.provider)
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
  { ctx, service, stream, tail }: GetServiceLogsParams<ContainerModule>,
) {
  const context = ctx.provider.config.context
  const resourceType = service.spec.daemon ? "daemonset" : "deployment"

  const kubectlArgs = ["logs", `${resourceType}/${service.name}`, "--timestamps=true"]

  if (tail) {
    kubectlArgs.push("--follow")
  }

  const namespace = await getAppNamespace(ctx, ctx.provider)
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
      void stream.write({ serviceName: service.name, timestamp, msg })
    })

  return new Promise<GetServiceLogsResult>((resolve, reject) => {
    proc.on("error", reject)

    proc.on("exit", () => {
      resolve({})
    })
  })
}

function getTestResultKey(module: ContainerModule, testName: string, version: ModuleVersion) {
  return `test-result--${module.name}--${testName}--${version.versionString}`
}
