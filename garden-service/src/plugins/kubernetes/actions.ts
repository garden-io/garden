/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { DeploymentError, ConfigurationError } from "../../exceptions"
import { RunResult, TestResult } from "../../types/plugin/outputs"
import {
  ExecInServiceParams,
  GetServiceOutputsParams,
  GetTestResultParams,
  RunModuleParams,
  TestModuleParams,
  DeleteServiceParams,
  RunServiceParams,
  RunTaskParams,
} from "../../types/plugin/params"
import { ModuleVersion } from "../../vcs/base"
import { ContainerModule, helpers, validateContainerModule } from "../container"
import { deserializeValues, serializeValues } from "../../util/util"
import { KubeApi } from "./api"
import { getAppNamespace, getMetadataNamespace } from "./namespace"
import { kubectl } from "./kubectl"
import { DEFAULT_TEST_TIMEOUT } from "../../constants"
import { getContainerServiceStatus, deleteContainerService } from "./deployment"
import { KubernetesProvider } from "./kubernetes"
import { ServiceStatus } from "../../types/service"
import { ValidateModuleParams } from "../../types/plugin/params"

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
  const { ctx, log, service } = params
  const namespace = await getAppNamespace(ctx, ctx.provider)
  const provider = ctx.provider

  await deleteContainerService(
    { provider, namespace, serviceName: service.name, log })

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
  const opts: string[] = []

  if (interactive) {
    opts.push("-it")
  }

  const kubecmd = ["exec", ...opts, pod.metadata.name, "--", ...command]
  const res = await kubectl(api.context, namespace).call(kubecmd, {
    ignoreError: true,
    timeout: 999999,
    tty: interactive,
  })

  return { code: res.code, output: res.output }
}

export async function runModule(
  {
    ctx, module, command, ignoreError = true, interactive, runtimeContext, timeout,
  }: RunModuleParams<ContainerModule>,
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
    "--quiet",
    "--rm",
    // Need to attach to get the log output and exit code.
    "-i",
  ]

  if (interactive) {
    opts.push("--tty")
  }

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
    ignoreError,
    timeout,
    tty: interactive,
  })

  return {
    moduleName: module.name,
    command,
    version,
    startedAt,
    completedAt: new Date(),
    output: res.output,
    success: res.code === 0,
  }
}

export async function runService(
  { ctx, service, interactive, runtimeContext, timeout, log, buildDependencies }:
    RunServiceParams<ContainerModule>,
) {
  return runModule({
    ctx,
    module: service.module,
    command: service.spec.command || [],
    interactive,
    runtimeContext,
    timeout,
    log,
    buildDependencies,
  })
}

export async function runTask(
  { ctx, task, interactive, runtimeContext, log, buildDependencies }:
    RunTaskParams<ContainerModule>,
) {
  const result = await runModule({
    ctx,
    buildDependencies,
    interactive,
    log,
    runtimeContext,
    module: task.module,
    command: task.spec.command || [],
    ignoreError: false,
    timeout: task.spec.timeout || 9999,
  })

  return {
    ...result,
    taskName: task.name,
  }
}

export async function testModule(
  { ctx, interactive, module, runtimeContext, testConfig, log, buildDependencies }:
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
    log,
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

function getTestResultKey(module: ContainerModule, testName: string, version: ModuleVersion) {
  return `test-result--${module.name}--${testName}--${version.versionString}`
}
