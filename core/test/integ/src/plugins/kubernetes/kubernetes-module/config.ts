/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { cloneDeep } from "lodash"

import { TestGarden } from "../../../../../helpers"
import { ModuleConfig } from "../../../../../../src/config/module"
import { apply } from "json-merge-patch"
import { getKubernetesTestGarden } from "./common"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../../../../src/constants"

describe("configureKubernetesModule", () => {
  let garden: TestGarden
  let moduleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    garden = await getKubernetesTestGarden()
    await garden.resolveModules({ log: garden.log })
    moduleConfigs = cloneDeep((<any>garden).moduleConfigs)
  })

  afterEach(() => {
    garden["moduleConfigs"] = cloneDeep(moduleConfigs)
  })

  function patchModuleConfig(name: string, patch: any) {
    apply((<any>garden).moduleConfigs[name], patch)
  }

  it("should validate a Kubernetes module", async () => {
    const module = await garden.resolveModule("module-simple")

    const taskSpec = {
      name: "echo-task",
      command: ["sh", "-c", "echo ok"],
      cacheResult: true,
      dependencies: [],
      disabled: false,
      timeout: null,
      env: {},
      artifacts: [],
    }

    const testSpec = {
      name: "echo-test",
      command: ["sh", "-c", "echo ok"],
      dependencies: [],
      disabled: false,
      timeout: null,
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
          serviceResource: {
            kind: "Deployment",
            name: "busybox-deployment",
          },
          tests: [testSpec],
          tasks: [taskSpec],
          timeout: 300,
        },
      },
    ])

    expect(module.taskConfigs).to.eql([
      {
        name: "echo-task",
        cacheResult: true,
        dependencies: [],
        disabled: false,
        spec: taskSpec,
        timeout: null,
      },
    ])

    expect(module.testConfigs).to.eql([
      {
        name: "echo-test",
        dependencies: [],
        disabled: false,
        spec: testSpec,
        timeout: null,
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
