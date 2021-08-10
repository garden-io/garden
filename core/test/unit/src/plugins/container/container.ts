/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve, join } from "path"
import { cloneDeep } from "lodash"
import td from "testdouble"

import { Garden } from "../../../../../src/garden"
import { PluginContext } from "../../../../../src/plugin-context"
import { gardenPlugin, ContainerProvider } from "../../../../../src/plugins/container/container"
import { dataDir, expectError, makeTestGarden } from "../../../../helpers"
import { moduleFromConfig } from "../../../../../src/types/module"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { ContainerModuleConfig, defaultContainerResources } from "../../../../../src/plugins/container/config"
import {
  containerHelpers as helpers,
  minDockerVersion,
  DEFAULT_BUILD_TIMEOUT,
} from "../../../../../src/plugins/container/helpers"
import { getDockerBuildFlags } from "../../../../../src/plugins/container/build"

describe("plugins.container", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const modulePath = resolve(dataDir, "test-project-container", "module-a")
  const relDockerfilePath = "docker-dir/Dockerfile"

  const plugin = gardenPlugin()
  const handlers = plugin.createModuleTypes![0].handlers
  const configure = handlers.configure!
  const build = handlers.build!
  const publishModule = handlers.publish!
  const getBuildStatus = handlers.getBuildStatus!

  const defaultCpu = defaultContainerResources.cpu
  const defaultMemory = defaultContainerResources.memory

  const baseConfig: ContainerModuleConfig = {
    allowPublish: false,
    build: {
      dependencies: [],
    },
    disabled: false,
    apiVersion: "garden.io/v0",
    name: "test",
    path: modulePath,
    type: "container",

    spec: {
      build: {
        dependencies: [],
        timeout: DEFAULT_BUILD_TIMEOUT,
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

  let garden: Garden
  let ctx: PluginContext
  let log: LogEntry
  let containerProvider: ContainerProvider

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin] })
    log = garden.log
    containerProvider = await garden.resolveProvider(garden.log, "container")
    ctx = await garden.getPluginContext(containerProvider)

    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
  })

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    const parsed = await configure({ ctx, moduleConfig, log })
    return moduleFromConfig({ garden, log, config: parsed.moduleConfig, buildDependencies: [], forceVersion: true })
  }

  it("has a stable build version even if a services, tests and tasks are added", async () => {
    const baseModule = await getTestModule(baseConfig)
    const withRuntime = await getTestModule({
      ...baseConfig,
      spec: {
        ...baseConfig.spec,
        services: [
          {
            name: "service-a",
            annotations: {},
            args: ["echo"],
            dependencies: [],
            daemon: false,
            disabled: false,
            ingresses: [],
            env: {
              SOME_ENV_VAR: "value",
            },
            limits: {
              cpu: 123,
              memory: 456,
            },
            cpu: defaultCpu,
            memory: defaultMemory,
            ports: [],
            replicas: 1,
            volumes: [],
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
            timeout: null,
            volumes: [],
          },
        ],
        tests: [
          {
            name: "unit",
            args: ["echo", "OK"],
            artifacts: [],
            dependencies: [],
            disabled: false,
            env: {
              TEST_ENV_VAR: "value",
            },
            cpu: defaultCpu,
            memory: defaultMemory,
            timeout: null,
            volumes: [],
          },
        ],
      },
    })
    expect(baseModule.version.versionString).to.equal(withRuntime.version.versionString)
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

  describe("configureContainerModule", () => {
    const containerModuleConfig: ContainerModuleConfig = {
      allowPublish: false,
      build: {
        dependencies: [],
      },
      disabled: false,
      apiVersion: "garden.io/v0",
      name: "module-a",
      path: modulePath,
      type: "container",

      spec: {
        build: {
          dependencies: [],
          timeout: DEFAULT_BUILD_TIMEOUT,
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
            timeout: null,
            volumes: [],
          },
        ],
        tests: [
          {
            name: "unit",
            args: ["echo", "OK"],
            artifacts: [],
            dependencies: [],
            disabled: false,
            env: {
              TEST_ENV_VAR: "value",
            },
            cpu: defaultCpu,
            memory: defaultMemory,
            timeout: null,
            volumes: [],
          },
        ],
      },

      serviceConfigs: [],
      taskConfigs: [],
      testConfigs: [],
    }

    it("should validate and parse a container module", async () => {
      const result = await configure({ ctx, moduleConfig: containerModuleConfig, log })

      expect(result).to.eql({
        moduleConfig: {
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          apiVersion: "garden.io/v0",
          name: "module-a",
          include: ["Dockerfile"],
          path: modulePath,
          type: "container",
          spec: {
            build: {
              dependencies: [],
              timeout: DEFAULT_BUILD_TIMEOUT,
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
                timeout: null,
                volumes: [],
              },
            ],
            tests: [
              {
                name: "unit",
                args: ["echo", "OK"],
                artifacts: [],
                dependencies: [],
                disabled: false,
                env: {
                  TEST_ENV_VAR: "value",
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                timeout: null,
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
              hotReloadable: false,
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
                timeout: null,
                volumes: [],
              },
              timeout: null,
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
                dependencies: [],
                disabled: false,
                env: {
                  TEST_ENV_VAR: "value",
                },
                cpu: defaultCpu,
                memory: defaultMemory,
                timeout: null,
                volumes: [],
              },
              timeout: null,
            },
          ],
        },
      })
    })

    context("hot reloading", () => {
      it("should pass if no target is a subdirectory of another target", async () => {
        const moduleConfig: ContainerModuleConfig = {
          ...containerModuleConfig,
          spec: {
            ...containerModuleConfig.spec,
            hotReload: {
              sync: [
                { source: "./foo_bar", target: "/home/somedir/foo_bar" },
                { source: "./bar", target: "/home/somedir/bar" },
              ],
            },
          },
        }
        await configure({ ctx, moduleConfig, log })
      })

      it("should throw if a target is a subdirectory of another target", async () => {
        const moduleConfig: ContainerModuleConfig = {
          ...containerModuleConfig,
          spec: {
            ...containerModuleConfig.spec,
            hotReload: {
              sync: [
                { source: "foo", target: "/somedir/" },
                { source: "bar", target: "/somedir/bar" },
              ],
            },
          },
        }
        await expectError(() => configure({ ctx, moduleConfig, log }))
      })
    })

    it("should add service volume modules as build and runtime dependencies", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "container",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
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
              healthCheck: {},
              limits: {
                cpu: 123,
                memory: 456,
              },
              cpu: defaultCpu,
              memory: defaultMemory,
              ports: [],
              replicas: 1,
              volumes: [
                {
                  name: "test",
                  containerPath: "/",
                  module: "volume-module",
                },
              ],
            },
          ],
          tasks: [],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      const result = await configure({ ctx, moduleConfig, log })

      expect(result.moduleConfig.build.dependencies).to.eql([{ name: "volume-module", copy: [] }])
      expect(result.moduleConfig.serviceConfigs[0].dependencies).to.eql(["volume-module"])
    })

    it("should add task volume modules as build and runtime dependencies", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "container",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
          },
          buildArgs: {},
          extraFlags: [],
          services: [],
          tasks: [
            {
              name: "task-a",
              args: [],
              artifacts: [],
              cacheResult: true,
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: null,
              volumes: [
                {
                  name: "test",
                  containerPath: "/",
                  module: "volume-module",
                },
              ],
            },
          ],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      const result = await configure({ ctx, moduleConfig, log })

      expect(result.moduleConfig.build.dependencies).to.eql([{ name: "volume-module", copy: [] }])
      expect(result.moduleConfig.taskConfigs[0].dependencies).to.eql(["volume-module"])
    })

    it("should add test volume modules as build and runtime dependencies", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "container",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
          },
          buildArgs: {},
          extraFlags: [],
          services: [],
          tasks: [],
          tests: [
            {
              name: "test-a",
              args: [],
              artifacts: [],
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: null,
              volumes: [
                {
                  name: "test",
                  containerPath: "/",
                  module: "volume-module",
                },
              ],
            },
          ],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      const result = await configure({ ctx, moduleConfig, log })

      expect(result.moduleConfig.build.dependencies).to.eql([{ name: "volume-module", copy: [] }])
      expect(result.moduleConfig.testConfigs[0].dependencies).to.eql(["volume-module"])
    })

    it("should fail with invalid port in ingress spec", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "test",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
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
              timeout: null,
              volumes: [],
            },
          ],
          tests: [
            {
              name: "unit",
              args: ["echo", "OK"],
              artifacts: [],
              dependencies: [],
              disabled: false,
              env: {},
              cpu: defaultCpu,
              memory: defaultMemory,
              timeout: null,
              volumes: [],
            },
          ],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      await expectError(() => configure({ ctx, moduleConfig, log }), "configuration")
    })

    it("should fail with invalid port in httpGet healthcheck spec", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "test",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
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
              timeout: null,
              volumes: [],
            },
          ],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      await expectError(() => configure({ ctx, moduleConfig, log }), "configuration")
    })

    it("should fail with invalid port in tcpPort healthcheck spec", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "test",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
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
              timeout: null,
              volumes: [],
            },
          ],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      await expectError(() => configure({ ctx, moduleConfig, log }), "configuration")
    })
  })

  describe("getBuildStatus", () => {
    it("should return ready:true if build exists locally", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const module = td.object(await getTestModule(baseConfig))

      td.replace(helpers, "imageExistsLocally", async () => true)

      const result = await getBuildStatus({ ctx, log, module })
      expect(result).to.eql({ ready: true })
    })

    it("should return ready:false if build does not exist locally", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const module = td.object(await getTestModule(baseConfig))

      td.replace(helpers, "imageExistsLocally", async () => false)

      const result = await getBuildStatus({ ctx, log, module })
      expect(result).to.eql({ ready: false })
    })
  })

  describe("build", () => {
    beforeEach(() => {
      td.replace(helpers, "checkDockerServerVersion", () => null)
    })

    it("should pull image if image tag is set and the module doesn't container a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => false)
      td.replace(helpers, "pullImage", async () => null)
      td.replace(helpers, "imageExistsLocally", async () => false)

      const result = await build({ ctx, log, module })

      expect(result).to.eql({ fetched: true })
    })

    it("should build image if module contains Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "imageExistsLocally", async () => false)
      td.replace(helpers, "getLocalImageId", () => "some/image")

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${module.version.versionString}`,
        module.buildPath,
      ]

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: "log",
        fresh: true,
        details: { identifier: "some/image" },
      })
    })

    it("should set build target image parameter if configured", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      config.spec.build.targetImage = "foo"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "imageExistsLocally", async () => false)
      td.replace(helpers, "getLocalImageId", () => "some/image")

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${module.version.versionString}`,
        "--target",
        "foo",
        module.buildPath,
      ]

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: "log",
        fresh: true,
        details: { identifier: "some/image" },
      })
    })

    it("should build image using the user specified Dockerfile path", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = relDockerfilePath

      td.replace(helpers, "hasDockerfile", () => true)

      const module = td.object(await getTestModule(config))

      td.replace(helpers, "imageExistsLocally", async () => false)
      td.replace(helpers, "getLocalImageId", () => "some/image")

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${module.version.versionString}`,
        "--file",
        join(module.buildPath, relDockerfilePath),
        module.buildPath,
      ]

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: "log",
        fresh: true,
        details: { identifier: "some/image" },
      })
    })
  })

  describe("publishModule", () => {
    it("should not publish image if module doesn't container a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => false)

      const result = await publishModule({ ctx, log, module })
      expect(result).to.eql({ published: false })
    })

    it("should publish image if module contains a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "getLocalImageId", () => "some/image:12345")
      td.replace(helpers, "getPublicImageId", () => "some/image:12345")

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(module.buildPath)
        expect(args).to.eql(["push", "some/image:12345"])
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await publishModule({ ctx, log, module })
      expect(result).to.eql({ message: "Published some/image:12345", published: true })
    })

    it("should tag image if remote id differs from local id", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "getLocalImageId", () => "some/image:12345")
      td.replace(helpers, "getPublicImageId", () => "some/image:1.1")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await publishModule({ ctx, log, module })
      expect(result).to.eql({ message: "Published some/image:1.1", published: true })

      td.verify(
        dockerCli({
          cwd: module.buildPath,
          args: ["tag", "some/image:12345", "some/image:1.1"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )

      td.verify(
        dockerCli({
          cwd: module.buildPath,
          args: ["push", "some/image:1.1"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )
    })

    it("should use specified tag if provided", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "getLocalImageId", () => "some/image:12345")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await publishModule({ ctx, log, module, tag: "custom-tag" })
      expect(result).to.eql({ message: "Published some/image:custom-tag", published: true })

      td.verify(
        dockerCli({
          cwd: module.buildPath,
          args: ["tag", "some/image:12345", "some/image:custom-tag"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )

      td.verify(
        dockerCli({
          cwd: module.buildPath,
          args: ["push", "some/image:custom-tag"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )
    })
  })

  describe("checkDockerServerVersion", () => {
    it("should return if server version is equal to the minimum version", async () => {
      helpers.checkDockerServerVersion(minDockerVersion)
    })

    it("should return if server version is greater than the minimum version", async () => {
      const version = {
        client: "99.99",
        server: "99.99",
      }

      helpers.checkDockerServerVersion(version)
    })

    it("should throw if server is not reachable (version is undefined)", async () => {
      const version = {
        client: minDockerVersion.client,
        server: undefined,
      }

      await expectError(
        () => helpers.checkDockerServerVersion(version),
        (err) => {
          expect(err.message).to.equal("Docker server is not running or cannot be reached.")
        }
      )
    })

    it("should throw if server version is too old", async () => {
      const version = {
        client: minDockerVersion.client,
        server: "17.06",
      }

      await expectError(
        () => helpers.checkDockerServerVersion(version),
        (err) => {
          expect(err.message).to.equal("Docker server needs to be version 17.07.0 or newer (got 17.06)")
        }
      )
    })
  })

  describe("getDockerBuildFlags", () => {
    it("should include extraFlags", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const module = await getTestModule({
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "container",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
          },
          buildArgs: {},
          extraFlags: ["--cache-from", "some-image:latest"],
          services: [],
          tasks: [],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      })

      const args = getDockerBuildFlags(module)

      expect(args.slice(-2)).to.eql(["--cache-from", "some-image:latest"])
    })

    it("should set GARDEN_MODULE_VERSION", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const module = await getTestModule({
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        path: modulePath,
        type: "container",

        spec: {
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
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
      })

      const args = getDockerBuildFlags(module)

      expect(args.slice(0, 2)).to.eql(["--build-arg", `GARDEN_MODULE_VERSION=${module.version.versionString}`])
    })
  })
})
