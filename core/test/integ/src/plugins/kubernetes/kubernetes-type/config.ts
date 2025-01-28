/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { TestGarden } from "../../../../../helpers.js"
import { getDataDir, makeTestGarden } from "../../../../../helpers.js"
import type { ModuleConfig } from "../../../../../../src/config/module.js"
import { apply } from "json-merge-patch"
import { getKubernetesTestGarden } from "./common.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_DEPLOY_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
} from "../../../../../../src/constants.js"
import { serialiseUnresolvedTemplates } from "../../../../../../src/template/types.js"
import { parseTemplateCollection } from "../../../../../../src/template/templated-collections.js"

describe("configureKubernetesModule", () => {
  let garden: TestGarden
  let moduleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    garden = await getKubernetesTestGarden()
    await garden.resolveModules({ log: garden.log })
    moduleConfigs = { ...garden.moduleConfigs }
  })

  afterEach(() => {
    garden.moduleConfigs = { ...moduleConfigs }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function patchModuleConfig(name: string, patch: any) {
    const moduleConfig = serialiseUnresolvedTemplates(garden.moduleConfigs[name]) as ModuleConfig
    apply(moduleConfig, patch)
    // @ts-expect-error todo: correct types for unresolved configs
    garden.moduleConfigs[name] = parseTemplateCollection({ value: moduleConfig, source: { path: [] } })
  }

  it("should validate a Kubernetes module", async () => {
    const module = await garden.resolveModule("module-simple")

    const taskSpec = {
      name: "echo-task",
      command: ["sh", "-c", "echo ok"],
      cacheResult: true,
      dependencies: [],
      disabled: false,
      timeout: DEFAULT_RUN_TIMEOUT_SEC,
      env: {},
      artifacts: [],
    }

    const testSpec = {
      name: "echo-test",
      command: ["sh", "-c", "echo ok"],
      dependencies: [],
      disabled: false,
      timeout: DEFAULT_TEST_TIMEOUT_SEC,
      env: {},
      artifacts: [],
    }

    expect(module.serviceConfigs).to.eql([
      {
        name: "module-simple",
        dependencies: [],
        disabled: false,
        sourceModuleName: undefined,
        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          },
          waitForJobs: false,
          dependencies: [],
          files: [],
          manifests: [
            {
              apiVersion: "apps/v1",
              kind: "Deployment",
              metadata: {
                name: "busybox-deployment",
                labels: {
                  app: "busybox",
                },
              },
              spec: {
                replicas: 1,
                selector: {
                  matchLabels: {
                    app: "busybox",
                  },
                },
                template: {
                  metadata: {
                    labels: {
                      app: "busybox",
                    },
                  },
                  spec: {
                    containers: [
                      {
                        name: "busybox",
                        image: "busybox:1.31.1",
                        args: ["sh", "-c", "while :; do sleep 2073600; done"],
                        env: [
                          { name: "FOO", value: "banana" },
                          { name: "BAR", value: "" },
                          { name: "BAZ", value: null },
                        ],
                        ports: [
                          {
                            containerPort: 80,
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          ],
          patchResources: [],
          serviceResource: {
            kind: "Deployment",
            name: "busybox-deployment",
          },
          tests: [testSpec],
          tasks: [taskSpec],
          timeout: 300,
        },
        timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
      },
    ])

    expect(module.taskConfigs).to.eql([
      {
        name: "echo-task",
        cacheResult: true,
        dependencies: [],
        disabled: false,
        spec: taskSpec,
        timeout: DEFAULT_RUN_TIMEOUT_SEC,
      },
    ])

    expect(module.testConfigs).to.eql([
      {
        name: "echo-test",
        dependencies: [],
        disabled: false,
        spec: testSpec,
        timeout: DEFAULT_TEST_TIMEOUT_SEC,
      },
    ])
  })

  it("should set include to equal files if neither include nor exclude has been set", async () => {
    patchModuleConfig("module-simple", { spec: { files: ["manifest.yaml"] } })
    const configInclude = await garden.resolveModule("module-simple")
    expect(configInclude.include).to.eql(["manifest.yaml"])
  })

  it("should not set default includes if include has already been explicitly set", async () => {
    patchModuleConfig("module-simple", { include: ["foo"] })
    const configInclude = await garden.resolveModule("module-simple")
    expect(configInclude.include).to.eql(["foo"])
  })

  it("should not set default includes if exclude has already been explicitly set", async () => {
    patchModuleConfig("module-simple", { exclude: ["bar"] })
    const configExclude = await garden.resolveModule("module-simple")
    expect(configExclude.include).to.be.undefined
  })
})

describe("configureKubernetesType", () => {
  let garden: TestGarden

  before(async () => {
    const projectRoot = getDataDir("test-projects", "kubernetes-type-conditional-manifests")
    garden = await makeTestGarden(projectRoot)
  })

  it("should resolve fine with null values for manifests in spec.files", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = graph.getDeploy("config-map-list")
    expect(action["_config"].spec.files).to.eql([null])
  })
})
