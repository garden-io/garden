/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as td from "testdouble"

import type { PluginContext } from "../../../../../src/plugin-context.js"
import type { ContainerProvider } from "../../../../../src/plugins/container/container.js"
import {
  gardenPlugin,
  convertContainerModule,
  configureContainerModule,
} from "../../../../../src/plugins/container/container.js"
import type { TestGarden } from "../../../../helpers.js"
import { expectError, getDataDir, makeTestGarden } from "../../../../helpers.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"
import type { GardenModule } from "../../../../../src/types/module.js"
import { moduleFromConfig } from "../../../../../src/types/module.js"
import { expect } from "chai"
import type {
  ContainerBuildActionSpec,
  ContainerModule,
  ContainerModuleConfig,
  ContainerRuntimeActionConfig,
} from "../../../../../src/plugins/container/moduleConfig.js"
import {
  defaultContainerResources,
  defaultDeploymentStrategy,
  defaultDockerfileName,
} from "../../../../../src/plugins/container/moduleConfig.js"
import type { ExecBuildConfig } from "../../../../../src/plugins/exec/build.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
  GardenApiVersion,
} from "../../../../../src/constants.js"
import { join, resolve } from "path"
import type { ConvertModuleParams } from "../../../../../src/plugin/handlers/Module/convert.js"
import { remove } from "lodash-es"
import type { GardenTask } from "../../../../../src/types/task.js"
import { taskFromConfig } from "../../../../../src/types/task.js"
import type { GardenService } from "../../../../../src/types/service.js"
import { serviceFromConfig } from "../../../../../src/types/service.js"
import type { GardenTest } from "../../../../../src/types/test.js"
import { testFromConfig } from "../../../../../src/types/test.js"

describe("plugins.container", () => {
  const projectRoot = getDataDir("test-project-container")
  const modulePath = resolve(projectRoot, "module-a")

  const defaultCpu = defaultContainerResources.cpu
  const defaultMemory = defaultContainerResources.memory

  const baseConfig: ContainerModuleConfig = {
    allowPublish: false,
    build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
    disabled: false,
    apiVersion: GardenApiVersion.v0,
    name: "test",
    path: modulePath,
    type: "container",

    spec: {
      build: {
        timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      },
      buildArgs: {},
      extraFlags: [],
      services: [],
      tasks: [],
      tests: [],
    },

    serviceConfigs: [],
    taskConfigs: [],
    testConfigs: [],
  }

  let garden: TestGarden
  let ctx: PluginContext
  let log: Log
  let containerProvider: ContainerProvider
  let graph: ConfigGraph

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = garden.log
    containerProvider = await garden.resolveProvider({ log: garden.log, name: "container" })
    ctx = await garden.getPluginContext({ provider: containerProvider, templateContext: undefined, events: undefined })
    graph = await garden.getConfigGraph({ log, emit: false })
    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
  })

  afterEach(() => {
    garden.close()
  })

  describe("convertContainerModule", () => {
    const getModuleConvertBaseParams = ({
      module,
      services = [],
      tasks = [],
      tests = [],
      prepareRuntimeDependencies = true,
    }: {
      module: GardenModule
      services?: GardenService[]
      tasks?: GardenTask[]
      tests?: GardenTest[]
      prepareRuntimeDependencies?: boolean
    }): ConvertModuleParams<ContainerModule> => ({
      baseFields: {
        copyFrom: [],
        disabled: false,
        internal: {
          basePath: "module-a",
        },
      },
      convertBuildDependency: () => ({ kind: "Build", type: "container", name: "buildDep" }),
      convertRuntimeDependencies: () => [{ kind: "Deploy", type: "container", name: "runtimeDep" }],
      convertTestName: () => "testName",
      ctx,
      dummyBuild: undefined,
      log,
      module,
      prepareRuntimeDependencies: prepareRuntimeDependencies
        ? () => [{ kind: "Deploy", type: "container", name: "preopRuntimeDep" }]
        : () => [],
      services,
      tasks,
      tests,
    })
    it("creates a Build action if there is a Dockerfile detected", async () => {
      const module = graph.getModule("module-a")
      const result = await convertContainerModule(getModuleConvertBaseParams({ module }))
      const build = result.group.actions.find((a) => a.kind === "Build")!
      expect(build).to.exist
      expect(build.type).to.be.eql("container")
    })

    it("creates a Build action if there is a Dockerfile explicitly configured", async () => {
      const module = graph.getModule("module-a") as ContainerModule
      module._config.spec.dockerfile = "Dockerfile"
      const result = await convertContainerModule(getModuleConvertBaseParams({ module }))
      const build = result.group.actions.find((a) => a.kind === "Build")!
      expect(build).to.exist
      expect(build.type).to.be.eql("container")
    })

    it("returns the dummy Build action if no Dockerfile and an exec Build is needed", async () => {
      const module = graph.getModule("module-a") as ContainerModule

      // remove automatically picked up Dockerfile
      const defaultDockerfilePath = join(module.path, defaultDockerfileName)
      remove(module.version.files, (f) => f === defaultDockerfilePath)

      const dummyBuild: ExecBuildConfig = {
        internal: {
          basePath: ".",
        },
        kind: "Build",
        type: "exec",
        name: "dummyBuild",
        timeout: DEFAULT_BUILD_TIMEOUT_SEC,
        spec: {
          command: ["echo"],
          env: {},
        },
      }
      const result = await convertContainerModule({ ...getModuleConvertBaseParams({ module }), dummyBuild })
      const build = result.group.actions.find((a) => a.kind === "Build")!
      expect(build).to.exist
      expect(build.type).to.be.eql("exec")
      expect(build.name).to.be.eql("dummyBuild")
    })

    it("sets spec.localId from module image field", async () => {
      const module = graph.getModule("module-a") as ContainerModule
      module.spec.image = "customImage"
      const result = await convertContainerModule(getModuleConvertBaseParams({ module }))
      const build = result.group.actions.find((a) => a.kind === "Build")!
      expect(build).to.exist
      expect(build.type).to.be.eql("container")
      expect((<ContainerBuildActionSpec>build.spec).localId).to.be.eql("customImage")
    })

    it("correctly converts a module with volume usage", async () => {
      const module = graph.getModule("module-a") as ContainerModule
      const volumesSpec = [
        {
          containerPath: ".",
          name: "test-volume",
          hostPath: "testPath",
        },
      ]
      module.spec.services[0].volumes = volumesSpec
      module.spec.tasks[0].volumes = volumesSpec
      const moduleGraph = graph.moduleGraph
      const result = await convertContainerModule(
        getModuleConvertBaseParams({
          module,
          services: module.serviceConfigs.map((c) => serviceFromConfig(moduleGraph, module, c)),
          tasks: module.taskConfigs.map((c) => taskFromConfig(module, c)),
          tests: [
            testFromConfig(
              module,
              {
                dependencies: [],
                disabled: false,
                name: "test",
                spec: {
                  volumes: [...volumesSpec],
                },
                timeout: 1,
              },
              moduleGraph
            ),
          ],
          prepareRuntimeDependencies: false,
        })
      )
      const build = result.group.actions.find((a) => a.kind === "Build")!
      const run = result.group.actions.find((a) => a.kind === "Run")!
      const test = result.group.actions.find((a) => a.kind === "Test")!
      const deploy = result.group.actions.find((a) => a.kind === "Deploy")!

      expect(build.dependencies?.length, "builds don't get the pvc dependency").to.eql(0)

      for (const runtimeAction of [run, test, deploy] as ContainerRuntimeActionConfig[]) {
        expect(runtimeAction.dependencies?.length).to.eql(0)
        expect(runtimeAction.spec.volumes.length).to.eql(1)
        expect(runtimeAction.spec.volumes).to.eql(volumesSpec)
      }
    })
  })

  describe("version calculations", () => {
    async function getTestModule(moduleConfig: ContainerModuleConfig) {
      return moduleFromConfig({
        garden,
        log,
        config: moduleConfig,
        buildDependencies: [],
        forceVersion: true,
        scanRoot: projectRoot,
      })
    }

    it("has same build version if nothing is changed", async () => {
      const baseModule = await getTestModule(baseConfig)
      const baseModule2 = await getTestModule(baseConfig)

      expect(baseModule.version.versionString).to.equal(baseModule2.version.versionString)
    })

    it("has different build version if buildArgs are added", async () => {
      const baseModule = await getTestModule(baseConfig)
      const changedBuild = await getTestModule({
        ...baseConfig,
        spec: {
          ...baseConfig.spec,
          buildArgs: { foo: "bar" },
        },
      })
      expect(baseModule.version.versionString).to.not.equal(changedBuild.version.versionString)
    })

    it("has different build version if a targetImage is set", async () => {
      const baseModule = await getTestModule(baseConfig)
      const changedBuild = await getTestModule({
        ...baseConfig,
        spec: {
          ...baseConfig.spec,
          build: {
            ...baseConfig.spec.build,
            targetImage: "foo",
          },
        },
      })
      expect(baseModule.version.versionString).to.not.equal(changedBuild.version.versionString)
    })

    it("has different build version if extraFlags are added", async () => {
      const baseModule = await getTestModule(baseConfig)
      const changedBuild = await getTestModule({
        ...baseConfig,
        spec: {
          ...baseConfig.spec,
          extraFlags: ["foo"],
        },
      })
      expect(baseModule.version.versionString).to.not.equal(changedBuild.version.versionString)
    })

    it("has different build version if dockerfile is changed", async () => {
      const baseModule = await getTestModule(baseConfig)
      const changedBuild = await getTestModule({
        ...baseConfig,
        spec: {
          ...baseConfig.spec,
          dockerfile: "foo.Dockerfile",
        },
      })
      expect(baseModule.version.versionString).to.not.equal(changedBuild.version.versionString)
    })
  })

  describe("configureContainerModule", () => {
    const containerModuleConfig: ContainerModuleConfig = {
      allowPublish: false,
      build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
      disabled: false,
      apiVersion: GardenApiVersion.v0,
      name: "module-a",
      path: modulePath,
      type: "container",

      spec: {
        build: {
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
        },
        buildArgs: {},
        extraFlags: [],
        services: [
          {
            name: "service-a",
            annotations: {},
            args: ["echo"],
            dependencies: [],
            daemon: false,
            disabled: false,
            ingresses: [
              {
                annotations: {},
                path: "/",
                port: "http",
              },
            ],
            env: {
              SOME_ENV_VAR: "value",
            },
            healthCheck: {
              httpGet: {
                path: "/health",
                port: "http",
              },
              livenessTimeoutSeconds: 10,
              readinessTimeoutSeconds: 10,
            },
            limits: {
              cpu: 123,
              memory: 456,
            },
            cpu: defaultCpu,
            memory: defaultMemory,
            ports: [
              {
                name: "http",
                protocol: "TCP",
                containerPort: 8080,
                servicePort: 8080,
              },
            ],
            replicas: 1,
            volumes: [],
            deploymentStrategy: defaultDeploymentStrategy,
          },
        ],
        tasks: [
          {
            name: "task-a",
            args: ["echo", "OK"],
            artifacts: [],
            cacheResult: true,
            dependencies: [],
            disabled: false,
            env: {
              TASK_ENV_VAR: "value",
            },
            cpu: defaultCpu,
            memory: defaultMemory,
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
            volumes: [],
          },
        ],
        tests: [
          {
            name: "unit",
            args: ["echo", "OK"],
            artifacts: [],
            cacheResult: true,
            dependencies: [],
            disabled: false,
            env: {
              TEST_ENV_VAR: "value",
            },
            cpu: defaultCpu,
            memory: defaultMemory,
            timeout: DEFAULT_TEST_TIMEOUT_SEC,
            volumes: [],
          },
        ],
      },

      serviceConfigs: [],
      taskConfigs: [],
      testConfigs: [],
    }

    it("should validate and parse a container module", async () => {
      const result = await configureContainerModule({ ctx, moduleConfig: containerModuleConfig, log })

      expect(result).to.eql({
        moduleConfig: {
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          include: [defaultDockerfileName],
          path: modulePath,
          type: "container",
          spec: {
            build: {
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            },
            buildArgs: {},
            extraFlags: [],
            services: [
              {
                name: "service-a",
                annotations: {},
                args: ["echo"],
                dependencies: [],
                disabled: false,
                daemon: false,
                ingresses: [
                  {
                    annotations: {},
                    path: "/",
                    port: "http",
                  },
                ],
                env: {
                  SOME_ENV_VAR: "value",
                },
                healthCheck: {
                  httpGet: { path: "/health", port: "http" },
                  readinessTimeoutSeconds: 10,
                  livenessTimeoutSeconds: 10,
                },
                limits: {
                  cpu: 123,
                  memory: 456,
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080, servicePort: 8080 }],
                replicas: 1,
                volumes: [],
                deploymentStrategy: defaultDeploymentStrategy,
              },
            ],
            tasks: [
              {
                name: "task-a",
                args: ["echo", "OK"],
                artifacts: [],
                cacheResult: true,
                dependencies: [],
                disabled: false,
                env: {
                  TASK_ENV_VAR: "value",
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                timeout: DEFAULT_RUN_TIMEOUT_SEC,
                volumes: [],
              },
            ],
            tests: [
              {
                name: "unit",
                args: ["echo", "OK"],
                artifacts: [],
                cacheResult: true,
                dependencies: [],
                disabled: false,
                env: {
                  TEST_ENV_VAR: "value",
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                timeout: DEFAULT_TEST_TIMEOUT_SEC,
                volumes: [],
              },
            ],
          },
          buildConfig: {
            buildArgs: {},
            dockerfile: undefined,
            extraFlags: [],
            targetImage: undefined,
          },
          serviceConfigs: [
            {
              name: "service-a",
              dependencies: [],
              disabled: false,

              spec: {
                name: "service-a",
                annotations: {},
                args: ["echo"],
                dependencies: [],
                disabled: false,
                daemon: false,
                ingresses: [
                  {
                    annotations: {},
                    path: "/",
                    port: "http",
                  },
                ],
                env: {
                  SOME_ENV_VAR: "value",
                },
                healthCheck: {
                  httpGet: { path: "/health", port: "http" },
                  readinessTimeoutSeconds: 10,
                  livenessTimeoutSeconds: 10,
                },
                limits: {
                  cpu: 123,
                  memory: 456,
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080, servicePort: 8080 }],
                replicas: 1,
                volumes: [],
                deploymentStrategy: defaultDeploymentStrategy,
              },
            },
          ],
          taskConfigs: [
            {
              cacheResult: true,
              dependencies: [],
              disabled: false,
              name: "task-a",
              spec: {
                args: ["echo", "OK"],
                artifacts: [],
                cacheResult: true,
                dependencies: [],
                disabled: false,
                env: {
                  TASK_ENV_VAR: "value",
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                name: "task-a",
                timeout: DEFAULT_RUN_TIMEOUT_SEC,
                volumes: [],
              },
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
            },
          ],
          testConfigs: [
            {
              name: "unit",
              dependencies: [],
              disabled: false,
              spec: {
                name: "unit",
                args: ["echo", "OK"],
                artifacts: [],
                cacheResult: true,
                dependencies: [],
                disabled: false,
                env: {
                  TEST_ENV_VAR: "value",
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                timeout: DEFAULT_TEST_TIMEOUT_SEC,
                volumes: [],
              },
              timeout: DEFAULT_TEST_TIMEOUT_SEC,
            },
          ],
        },
      })
    })

    it("should fail with invalid port in ingress spec", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        apiVersion: GardenApiVersion.v0,
        name: "module-a",
        path: modulePath,
        type: "test",

        spec: {
          build: {
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          },
          buildArgs: {},
          extraFlags: [],
          services: [
            {
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
              daemon: false,
              disabled: false,
              ingresses: [
                {
                  annotations: {},
                  path: "/",
                  port: "bla",
                },
              ],
              cpu: defaultCpu,
              memory: defaultMemory,
              env: {},
              ports: [],
              replicas: 1,
              volumes: [],
              deploymentStrategy: defaultDeploymentStrategy,
            },
          ],
          tasks: [
            {
              name: "task-a",
              args: ["echo"],
              artifacts: [],
              cacheResult: true,
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              volumes: [],
            },
          ],
          tests: [
            {
              name: "unit",
              args: ["echo", "OK"],
              artifacts: [],
              cacheResult: true,
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: DEFAULT_TEST_TIMEOUT_SEC,
              volumes: [],
            },
          ],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      await expectError(() => configureContainerModule({ ctx, moduleConfig, log }), "configuration")
    })

    it("should fail with invalid port in httpGet healthcheck spec", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        apiVersion: GardenApiVersion.v0,
        name: "module-a",
        path: modulePath,
        type: "test",

        spec: {
          build: {
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          },
          buildArgs: {},
          extraFlags: [],
          services: [
            {
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
              daemon: false,
              disabled: false,
              ingresses: [],
              env: {},
              healthCheck: {
                httpGet: {
                  path: "/",
                  port: "bla",
                },
              },
              cpu: defaultCpu,
              memory: defaultMemory,
              ports: [],
              replicas: 1,
              volumes: [],
              deploymentStrategy: defaultDeploymentStrategy,
            },
          ],
          tasks: [
            {
              name: "task-a",
              args: ["echo"],
              artifacts: [],
              cacheResult: true,
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              volumes: [],
            },
          ],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      await expectError(() => configureContainerModule({ ctx, moduleConfig, log }), "configuration")
    })

    it("should fail with invalid port in tcpPort healthcheck spec", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        apiVersion: GardenApiVersion.v0,
        name: "module-a",
        path: modulePath,
        type: "test",

        spec: {
          build: {
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          },
          buildArgs: {},
          extraFlags: [],
          services: [
            {
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
              daemon: false,
              disabled: false,
              ingresses: [],
              env: {},
              healthCheck: {
                tcpPort: "bla",
              },
              cpu: defaultCpu,
              memory: defaultMemory,
              ports: [],
              replicas: 1,
              volumes: [],
              deploymentStrategy: defaultDeploymentStrategy,
            },
          ],
          tasks: [
            {
              name: "task-a",
              args: ["echo"],
              artifacts: [],
              cacheResult: true,
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              volumes: [],
            },
          ],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      await expectError(() => configureContainerModule({ ctx, moduleConfig, log }), "configuration")
    })
  })
})
