import { expect } from "chai"
import { resolve, join } from "path"
import { cloneDeep } from "lodash"
import td from "testdouble"

import { Garden } from "../../../../../src/garden"
import { PluginContext } from "../../../../../src/plugin-context"
import { gardenPlugin } from "../../../../../src/plugins/container/container"
import { dataDir, expectError, makeTestGarden } from "../../../../helpers"
import { moduleFromConfig } from "../../../../../src/types/module"
import { ModuleConfig } from "../../../../../src/config/module"
import { LogEntry } from "../../../../../src/logger/log-entry"
import {
  ContainerModuleSpec,
  ContainerModuleConfig,
  defaultContainerLimits,
} from "../../../../../src/plugins/container/config"
import {
  containerHelpers as helpers,
  minDockerVersion,
  DEFAULT_BUILD_TIMEOUT,
} from "../../../../../src/plugins/container/helpers"

describe("plugins.container", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const modulePath = resolve(dataDir, "test-project-container", "module-a")
  const relDockerfilePath = "docker-dir/Dockerfile"

  const plugin = gardenPlugin
  const handlers = plugin.createModuleTypes![0].handlers
  const configure = handlers.configure!
  const build = handlers.build!
  const publishModule = handlers.publish!
  const getBuildStatus = handlers.getBuildStatus!

  const baseConfig: ModuleConfig<ContainerModuleSpec, any, any> = {
    allowPublish: false,
    build: {
      dependencies: [],
    },
    disabled: false,
    apiVersion: "garden.io/v0",
    name: "test",
    outputs: {},
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

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin] })
    log = garden.log
    const provider = await garden.resolveProvider("container")
    ctx = garden.getPluginContext(provider)

    td.replace(garden.buildDir, "syncDependencyProducts", () => null)

    td.replace(Garden.prototype, "resolveVersion", async () => ({
      versionString: "1234",
      dependencyVersions: {},
      files: [],
    }))
  })

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    const parsed = await configure({ ctx, moduleConfig, log })
    const graph = await garden.getConfigGraph(garden.log)
    return moduleFromConfig(garden, graph, parsed.moduleConfig)
  }

  describe("validate", () => {
    it("should validate and parse a container module", async () => {
      const moduleConfig: ContainerModuleConfig = {
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "module-a",
        outputs: {},
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
              },
              limits: {
                cpu: 123,
                memory: 456,
              },
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
              dependencies: [],
              disabled: false,
              env: {
                TASK_ENV_VAR: "value",
              },
              timeout: null,
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
              timeout: null,
            },
          ],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      }

      const result = await configure({ ctx, moduleConfig, log })

      expect(result).to.eql({
        moduleConfig: {
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          apiVersion: "garden.io/v0",
          name: "module-a",
          include: ["Dockerfile"],
          outputs: {
            "local-image-name": "module-a",
            "deployment-image-name": "module-a",
          },
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
                healthCheck: { httpGet: { path: "/health", port: "http" } },
                limits: {
                  cpu: 123,
                  memory: 456,
                },
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
                dependencies: [],
                disabled: false,
                env: {
                  TASK_ENV_VAR: "value",
                },
                timeout: null,
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
                timeout: null,
              },
            ],
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
                healthCheck: { httpGet: { path: "/health", port: "http" } },
                limits: {
                  cpu: 123,
                  memory: 456,
                },
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080, servicePort: 8080 }],
                replicas: 1,
                volumes: [],
              },
            },
          ],
          taskConfigs: [
            {
              dependencies: [],
              disabled: false,
              name: "task-a",
              spec: {
                args: ["echo", "OK"],
                artifacts: [],
                dependencies: [],
                disabled: false,
                env: {
                  TASK_ENV_VAR: "value",
                },
                name: "task-a",
                timeout: null,
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
                timeout: null,
              },
              timeout: null,
            },
          ],
        },
      })
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
        outputs: {},
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
              limits: defaultContainerLimits,
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
              dependencies: [],
              disabled: false,
              env: {},
              timeout: null,
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
              timeout: null,
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
        outputs: {},
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
              limits: defaultContainerLimits,
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
              dependencies: [],
              disabled: false,
              env: {},
              timeout: null,
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
        outputs: {},
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
              limits: defaultContainerLimits,
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
              dependencies: [],
              disabled: false,
              env: {},
              timeout: null,
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
      const module = td.object(await getTestModule(baseConfig))

      td.replace(helpers, "imageExistsLocally", async () => true)

      const result = await getBuildStatus({ ctx, log, module })
      expect(result).to.eql({ ready: true })
    })

    it("should return ready:false if build does not exist locally", async () => {
      const module = td.object(await getTestModule(baseConfig))

      td.replace(helpers, "imageExistsLocally", async () => false)

      const result = await getBuildStatus({ ctx, log, module })
      expect(result).to.eql({ ready: false })
    })
  })

  describe("build", () => {
    it("should pull image if image tag is set and the module doesn't container a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", async () => false)
      td.replace(helpers, "pullImage", async () => null)
      td.replace(helpers, "imageExistsLocally", async () => false)

      const result = await build({ ctx, log, module })

      expect(result).to.eql({ fetched: true })
    })

    it("should build image if module contains Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", async () => true)
      td.replace(helpers, "imageExistsLocally", async () => false)
      td.replace(helpers, "getLocalImageId", async () => "some/image")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: undefined,
        fresh: true,
        details: { identifier: "some/image" },
      })

      const cmdArgs = ["build", "-t", "some/image", module.buildPath]
      td.verify(dockerCli(module, cmdArgs), { ignoreExtraArgs: true })
    })

    it("should set build target image parameter if configured", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      config.spec.build.targetImage = "foo"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", async () => true)
      td.replace(helpers, "imageExistsLocally", async () => false)
      td.replace(helpers, "getLocalImageId", async () => "some/image")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: undefined,
        fresh: true,
        details: { identifier: "some/image" },
      })

      const cmdArgs = ["build", "-t", "some/image", "--target", "foo", module.buildPath]
      td.verify(dockerCli(module, cmdArgs), { ignoreExtraArgs: true })
    })

    it("should build image using the user specified Dockerfile path", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = relDockerfilePath

      td.replace(helpers, "hasDockerfile", async () => true)

      const module = td.object(await getTestModule(config))

      td.replace(helpers, "imageExistsLocally", async () => false)
      td.replace(helpers, "getLocalImageId", async () => "some/image")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await build({ ctx, log, module })

      expect(result).to.eql({
        buildLog: undefined,
        fresh: true,
        details: { identifier: "some/image" },
      })

      const cmdArgs = [
        "build",
        "-t",
        "some/image",
        "--file",
        join(module.buildPath, relDockerfilePath),
        module.buildPath,
      ]
      td.verify(dockerCli(module, cmdArgs), { ignoreExtraArgs: true })
    })
  })

  describe("publishModule", () => {
    it("should not publish image if module doesn't container a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", async () => false)

      const result = await publishModule({ ctx, log, module })
      expect(result).to.eql({ published: false })
    })

    it("should publish image if module contains a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", async () => true)
      td.replace(helpers, "getLocalImageId", async () => "some/image:12345")
      td.replace(helpers, "getPublicImageId", async () => "some/image:12345")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await publishModule({ ctx, log, module })
      expect(result).to.eql({ message: "Published some/image:12345", published: true })

      td.verify(dockerCli(module, ["tag", "some/image:12345", "some/image:12345"]), { times: 0 })
      td.verify(dockerCli(module, ["push", "some/image:12345"]))
    })

    it("should tag image if remote id differs from local id", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = td.object(await getTestModule(config))

      td.replace(helpers, "hasDockerfile", async () => true)
      td.replace(helpers, "getLocalImageId", () => "some/image:12345")
      td.replace(helpers, "getPublicImageId", () => "some/image:1.1")

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await publishModule({ ctx, log, module })
      expect(result).to.eql({ message: "Published some/image:1.1", published: true })

      td.verify(dockerCli(module, ["tag", "some/image:12345", "some/image:1.1"]))
      td.verify(dockerCli(module, ["push", "some/image:1.1"]))
    })
  })

  describe("checkDockerVersion", () => {
    it("should return if client and server version is equal to minimum version", async () => {
      helpers.dockerVersionChecked = false

      td.replace(helpers, "getDockerVersion", async () => ({
        clientVersion: minDockerVersion,
        serverVersion: minDockerVersion,
      }))

      await helpers.checkDockerVersion()
    })

    it("should return if client and server version is greater than minimum version", async () => {
      helpers.dockerVersionChecked = false

      td.replace(helpers, "getDockerVersion", async () => ({
        clientVersion: "99.99",
        serverVersion: "99.99",
      }))

      await helpers.checkDockerVersion()
    })

    it("should throw if client version is too old", async () => {
      helpers.dockerVersionChecked = false

      td.replace(helpers, "getDockerVersion", async () => ({
        clientVersion: "17.06",
        serverVersion: minDockerVersion,
      }))

      await expectError(
        () => helpers.checkDockerVersion(),
        (err) => {
          expect(err.message).to.equal("Docker client needs to be version 17.07.0 or newer (got 17.06)")
        }
      )
    })

    it("should throw if server version is too old", async () => {
      helpers.dockerVersionChecked = false

      td.replace(helpers, "getDockerVersion", async () => ({
        clientVersion: minDockerVersion,
        serverVersion: "17.06",
      }))

      await expectError(
        () => helpers.checkDockerVersion(),
        (err) => {
          expect(err.message).to.equal("Docker server needs to be version 17.07.0 or newer (got 17.06)")
        }
      )
    })
  })
})
