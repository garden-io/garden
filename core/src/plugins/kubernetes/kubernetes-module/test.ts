/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { KubernetesModule } from "./config"
import { runAndCopy } from "../run"
import { KubernetesPluginContext } from "../config"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"
import { getModuleNamespaceStatus } from "../namespace"
import { KubeApi } from "../api"
import { getManifests } from "./common"
import {
  getServiceResourceSpec,
  getServiceResource,
  getResourceContainer,
  makePodName,
  getResourcePodSpec,
} from "../util"

export async function testKubernetesModule(params: TestModuleParams<KubernetesModule>): Promise<TestResult> {
  const { ctx, log, module, test } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  // Get the container spec to use for running
  const manifests = await getManifests({ ctx, api, log, module, defaultNamespace: namespace })
  const resourceSpec = test.config.spec.resource || getServiceResourceSpec(module, undefined)
  const target = await getServiceResource({
    ctx: k8sCtx,
    log,
    provider: k8sCtx.provider,
    manifests,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  const testName = test.name
  const { command, args } = test.config.spec
  const image = container.image!
  const timeout = test.config.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runAndCopy({
    ...params,
    container,
    podSpec: getResourcePodSpec(target),
    command,
    args,
    artifacts: test.config.spec.artifacts,
    envVars: test.config.spec.env,
    image,
    namespace,
    podName: makePodName("test", module.name, testName),
    description: `Test '${testName}' in container module '${module.name}'`,
    timeout,
    version: test.version,
  })

  return storeTestResult({
    ctx: k8sCtx,
    log,
    module,
    test,
    result: {
      testName,
      namespaceStatus,
      ...result,
    },
  })
}
