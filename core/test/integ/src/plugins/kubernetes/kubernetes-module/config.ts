/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { expect } from "chai"
import { cloneDeep } from "lodash"

import { TestGarden } from "../../../../../helpers"
import { PluginContext } from "../../../../../../src/plugin-context"
import { ModuleConfig } from "../../../../../../src/config/module"
import { apply } from "json-merge-patch"
import { getKubernetesTestGarden } from "./common"

describe("validateKubernetesModule", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let moduleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    garden = await getKubernetesTestGarden()
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
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

    const serviceResource = {
      kind: "Deployment",
      name: "busybox-deployment",
    }

    const taskSpecs = [
      {
        name: "echo-task",
        command: ["sh", "-c", "echo ok"],
        cacheResult: true,
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        artifacts: [],
      },
    ]

    const testSpecs = [
      {
        name: "echo-test",
        command: ["sh", "-c", "echo ok"],
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        artifacts: [],
      },
    ]

    expect(module._config).to.eql({
      allowPublish: true,
      apiVersion: "garden.io/v0",
      build: {
        dependencies: [],
      },
      configPath: resolve(ctx.projectRoot, "module-simple", "garden.yml"),
      description: "Simple Kubernetes module with minimum config",
      disabled: false,
      exclude: undefined,
      generateFiles: undefined,
      include: [],
      inputs: {},
      kind: "Module",
      name: "module-simple",
      path: resolve(ctx.projectRoot, "module-simple"),
      repositoryUrl: undefined,
      serviceConfigs: [
        {
          dependencies: [],
          disabled: false,
          hotReloadable: false,
          sourceModuleName: undefined,
          name: "module-simple",
          spec: {
            build: {
              dependencies: [],
            },
            dependencies: [],
            files: [],
            manifests: [
              {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                  labels: {
                    app: "busybox",
                  },
                  name: "busybox-deployment",
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
                          image: "busybox:1.31.1",
                          name: "busybox",
                          args: ["sleep", "100"],
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
            serviceResource,
            tasks: taskSpecs,
            tests: testSpecs,
          },
        },
      ],
      spec: {
        build: {
          dependencies: [],
        },
        dependencies: [],
        files: [],
        manifests: [
          {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
              labels: {
                app: "busybox",
              },
              name: "busybox-deployment",
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
                      image: "busybox:1.31.1",
                      name: "busybox",
                      args: ["sleep", "100"],
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
        serviceResource,
        tasks: taskSpecs,
        tests: testSpecs,
      },
      taskConfigs: [
        {
          name: "echo-task",
          cacheResult: true,
          dependencies: [],
          disabled: false,
          spec: taskSpecs[0],
          timeout: null,
        },
      ],
      testConfigs: [
        {
          name: "echo-test",
          dependencies: [],
          disabled: false,
          spec: testSpecs[0],
          timeout: null,
        },
      ],
      type: "kubernetes",
    })
  })

  it("should validate a Kubernetes module that has a source module", async () => {
    const module = await garden.resolveModule("with-source-module")
    const graph = await garden.getConfigGraph(garden.log)
    const imageModule = graph.getModule("api-image")
    const { versionString } = imageModule.version

    const serviceResource = {
      kind: "Deployment",
      name: "api-deployment",
      imageModule: "api-image",
      containerName: "api",
    }

    const taskSpecs = [
      {
        name: "with-source-module-task",
        command: ["sh", "-c", "echo ok"],
        cacheResult: true,
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        artifacts: [],
      },
    ]

    const testSpecs = [
      {
        name: "with-source-module-test",
        command: ["sh", "-c", "echo ok"],
        dependencies: [],
        disabled: false,
        timeout: null,
        env: {},
        artifacts: [],
      },
    ]

    expect(module._config).to.eql({
      allowPublish: true,
      apiVersion: "garden.io/v0",
      build: {
        dependencies: [],
      },
      configPath: resolve(ctx.projectRoot, "with-source-module", "garden.yml"),
      description: "Simple Kubernetes module with minimum config that has a container source module",
      disabled: false,
      exclude: undefined,
      generateFiles: undefined,
      inputs: {},
      include: [],
      kind: "Module",
      name: "with-source-module",
      path: resolve(ctx.projectRoot, "with-source-module"),
      repositoryUrl: undefined,
      serviceConfigs: [
        {
          dependencies: [],
          disabled: false,
          hotReloadable: true,
          sourceModuleName: "api-image",
          name: "with-source-module",
          spec: {
            build: {
              dependencies: [],
            },
            dependencies: [],
            files: [],
            manifests: [
              {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                  labels: {
                    app: "api",
                  },
                  name: "api-deployment",
                },
                spec: {
                  replicas: 1,
                  selector: {
                    matchLabels: {
                      app: "api",
                    },
                  },
                  template: {
                    metadata: {
                      labels: {
                        app: "api",
                      },
                    },
                    spec: {
                      containers: [
                        {
                          image: `api-image:${versionString}`,
                          args: ["python", "app.py"],
                          name: "api",
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
            serviceResource,
            tasks: taskSpecs,
            tests: testSpecs,
          },
        },
      ],
      spec: {
        build: {
          dependencies: [],
        },
        dependencies: [],
        files: [],
        manifests: [
          {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
              labels: {
                app: "api",
              },
              name: "api-deployment",
            },
            spec: {
              replicas: 1,
              selector: {
                matchLabels: {
                  app: "api",
                },
              },
              template: {
                metadata: {
                  labels: {
                    app: "api",
                  },
                },
                spec: {
                  containers: [
                    {
                      image: `api-image:${versionString}`,
                      args: ["python", "app.py"],
                      name: "api",
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
        serviceResource,
        tasks: taskSpecs,
        tests: testSpecs,
      },
      taskConfigs: [
        {
          name: "with-source-module-task",
          cacheResult: true,
          dependencies: [],
          disabled: false,
          spec: taskSpecs[0],
          timeout: null,
        },
      ],
      testConfigs: [
        {
          name: "with-source-module-test",
          dependencies: [],
          disabled: false,
          spec: testSpecs[0],
          timeout: null,
        },
      ],
      type: "kubernetes",
    })
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
