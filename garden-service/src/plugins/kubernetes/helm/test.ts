/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { HelmModule } from "./config"
import { getAppNamespace } from "../namespace"
import { runPod } from "../run"
import { findServiceResource, getChartResources, getResourceContainer, getServiceResourceSpec } from "./common"
import { KubernetesPluginContext } from "../config"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"
import { V1PodSpec } from "@kubernetes/client-node"
import { uniqByName } from "../../../util/util"
import { prepareEnvVars } from "../util"

export async function testHelmModule({
  ctx,
  log,
  interactive,
  module,
  runtimeContext,
  testConfig,
  testVersion,
}: TestModuleParams<HelmModule>): Promise<TestResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // Get the container spec to use for running
  const chartResources = await getChartResources(k8sCtx, module, log)
  const resourceSpec = testConfig.spec.resource || getServiceResourceSpec(module)
  const target = await findServiceResource({
    ctx: k8sCtx,
    log,
    chartResources,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  const testName = testConfig.name
  const { command, args } = testConfig.spec
  const image = container.image
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  // Apply overrides
  const envVars = { ...runtimeContext.envVars, ...testConfig.spec.env }
  const env = uniqByName([...prepareEnvVars(envVars), ...(container.env || [])])

  const spec: V1PodSpec = {
    containers: [
      {
        ...container,
        ...(command && { command }),
        ...(args && { args }),
        env,
        // TODO: consider supporting volume mounts in ad-hoc runs (would need specific logic and testing)
        volumeMounts: [],
      },
    ],
  }

  const result = await runPod({
    provider,
    image,
    interactive,
    ignoreError: true, // to ensure results get stored when an error occurs
    log,
    module,
    namespace,
    spec,
    timeout,
  })

  return storeTestResult({
    ctx: k8sCtx,
    log,
    module,
    testName,
    testVersion,
    result: {
      testName,
      ...result,
    },
  })
}
