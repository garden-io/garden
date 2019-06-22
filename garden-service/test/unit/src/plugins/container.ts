import { expect } from "chai"
import { resolve, join } from "path"
import { cloneDeep } from "lodash"
import * as td from "testdouble"

import { Garden } from "../../../../src/garden"
import { PluginContext } from "../../../../src/plugin-context"
import { gardenPlugin } from "../../../../src/plugins/container/container"
import {
  dataDir,
  expectError,
  makeTestGarden,
} from "../../../helpers"
import { moduleFromConfig } from "../../../../src/types/module"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"
import {
  ContainerModuleSpec,
  ContainerModuleConfig,
  defaultContainerLimits,
} from "../../../../src/plugins/container/config"
import { containerHelpers as helpers, minDockerVersion } from "../../../../src/plugins/container/helpers"

describe("plugins.container", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const modulePath = resolve(dataDir, "test-project-container", "module-a")
  const relDockerfilePath = "docker-dir/Dockerfile"

  const handler = gardenPlugin()
  const configure = handler.moduleActions!.container!.configure!
  const build = handler.moduleActions!.container!.build!
  const publishModule = handler.moduleActions!.container!.publishModule!
  const getBuildStatus = handler.moduleActions!.container!.getBuildStatus!

  const baseConfig: ModuleConfig<ContainerModuleSpec, any, any> = {
    allowPublish: false,
    build: {
      dependencies: [],
    },
    apiVersion: "garden.io/v0",
    name: "test",
    outputs: {},
    path: modulePath,
    type: "container",

    spec: {
      build: { dependencies: [] },
      buildArgs: {},
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
    garden = await makeTestGarden(projectRoot, { extraPlugins: { container: gardenPlugin } })
    log = garden.log
    ctx = await garden.getPluginContext("container")

    td.replace(garden.buildDir, "syncDependencyProducts", () => null)

    td.replace(Garden.prototype, "resolveVersion", async () => ({
      versionString: "1234",
      dependencyVersions: {},
      files: [],
    }))
  })

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    const parsed = await configure({ ctx, moduleConfig, log })
    const graph = await garden.getConfigGraph()
    return moduleFromConfig(garden, graph, parsed)
  }

  describe("getLocalImageId", () => {
    it("should return configured image name with local version if module has a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => true)

      expect(await helpers.getLocalImageId(module)).to.equal("some/image:1234")
    })

    it("should return configured image name and tag if module has no Dockerfile and name includes tag", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => false)

      expect(await helpers.getLocalImageId(module)).to.equal("some/image:1.1")
    })

    it("should return module name with local version if there is a Dockerfile and no configured name", async () => {
      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => true)

      expect(await helpers.getLocalImageId(module)).to.equal("test:1234")
    })

    it("should return module name with local version if there is no Dockerfile and no configured name", async () => {
      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => false)

      expect(await helpers.getLocalImageId(module)).to.equal("test:1234")
    })
  })

  describe("getLocalImageName", () => {
    it("should return configured image name with no version if specified", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      expect(await helpers.getLocalImageName(module)).to.equal("some/image")
    })

    it("should return module name if no image name is specified", async () => {
      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      expect(await helpers.getLocalImageName(module)).to.equal(config.name)
    })
  })

  describe("getDeploymentImageId", () => {
    it("should return module name with module version if there is a Dockerfile and no image name set", async () => {
      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => true)

      expect(await helpers.getDeploymentImageId(module)).to.equal("test:1234")
    })

    it("should return image name with module version if there is a Dockerfile and image name is set", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => true)

      expect(await helpers.getDeploymentImageId(module)).to.equal("some/image:1234")
    })

    it("should return configured image tag if there is no Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => false)

      expect(await helpers.getDeploymentImageId(module)).to.equal("some/image:1.1")
    })

    it("should throw if no image name is set and there is no Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => false)

      await expectError(() => helpers.getDeploymentImageId(module), "configuration")
    })
  })

  describe("getDockerfileBuildPath", () => {
    it("should return the absolute default Dockerfile path", async () => {
      const module = await getTestModule(baseConfig)

      const path = await helpers.getDockerfileBuildPath(module)
      expect(path).to.equal(join(module.buildPath, "Dockerfile"))
    })

    it("should return the absolute user specified Dockerfile path", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = relDockerfilePath
      const module = await getTestModule(config)

      const path = await helpers.getDockerfileBuildPath(module)
      expect(path).to.equal(join(module.buildPath, relDockerfilePath))
    })
  })

  describe("getDockerfileSourcePath", () => {
    it("should return the absolute default Dockerfile path", async () => {
      const module = await getTestModule(baseConfig)

      const path = await helpers.getDockerfileSourcePath(module)
      expect(path).to.equal(join(module.path, "Dockerfile"))
    })

    it("should return the absolute user specified Dockerfile path", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = relDockerfilePath
      const module = await getTestModule(config)

      const path = await helpers.getDockerfileSourcePath(module)
      expect(path).to.equal(join(module.path, relDockerfilePath))
    })
  })

  describe("getPublicImageId", () => {
    it("should use image name including version if specified", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      expect(await helpers.getPublicImageId(module)).to.equal("some/image:1.1")
    })

    it("should use image name if specified with commit hash if no version is set", async () => {
      const module = await getTestModule({
        allowPublish: false,
        build: {
          dependencies: [],
        },
        name: "test",
        apiVersion: "garden.io/v0",
        outputs: {},
        path: modulePath,
        type: "container",

        spec: {
          build: { dependencies: [] },
          buildArgs: {},
          image: "some/image",
          services: [],
          tasks: [],
          tests: [],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      })

      expect(await helpers.getPublicImageId(module)).to.equal("some/image:1234")
    })

    it("should use local id if no image name is set", async () => {
      const module = await getTestModule(baseConfig)

      td.replace(helpers, "getLocalImageId", async () => "test:1234")

      expect(await helpers.getPublicImageId(module)).to.equal("test:1234")
    })
  })

  describe("getDockerfilePathFromConfig", () => {
    it("should return the absolute default Dockerfile path", async () => {
      const path = await helpers.getDockerfileSourcePath(baseConfig)
      expect(path).to.equal(join(baseConfig.path, "Dockerfile"))
    })

    it("should return the absolute user specified Dockerfile path", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = relDockerfilePath

      const path = await helpers.getDockerfileSourcePath(config)
      expect(path).to.equal(join(config.path, relDockerfilePath))
    })
  })

  describe("parseImageId", () => {
    it("should correctly parse a simple id", () => {
      expect(helpers.parseImageId("image:tag")).to.eql({
        repository: "image",
        tag: "tag",
      })
    })

    it("should correctly parse an id with a namespace", () => {
      expect(helpers.parseImageId("namespace/image:tag")).to.eql({
        namespace: "namespace",
        repository: "image",
        tag: "tag",
      })
    })

    it("should correctly parse an id with a host and namespace", () => {
      expect(helpers.parseImageId("my-host.com/namespace/image:tag")).to.eql({
        host: "my-host.com",
        namespace: "namespace",
        repository: "image",
        tag: "tag",
      })
    })

    it("should correctly parse an id with a host with a port, and namespace", () => {
      expect(helpers.parseImageId("localhost:5000/namespace/image:tag")).to.eql({
        host: "localhost:5000",
        namespace: "namespace",
        repository: "image",
        tag: "tag",
      })
    })

    it("should correctly parse an id with a host and multi-level namespace", () => {
      expect(helpers.parseImageId("my-host.com/a/b/c/d/image:tag")).to.eql({
        host: "my-host.com",
        namespace: "a/b/c/d",
        repository: "image",
        tag: "tag",
      })
    })

    it("should throw on an empty name", async () => {
      await expectError(() => helpers.parseImageId(""), "configuration")
    })
  })

  describe("unparseImageId", () => {
    it("should correctly compose a simple id", () => {
      expect(helpers.unparseImageId({
        repository: "image",
        tag: "tag",
      })).to.equal("image:tag")
    })

    it("should correctly compose an id with a namespace", () => {
      expect(helpers.unparseImageId({
        namespace: "namespace",
        repository: "image",
        tag: "tag",
      })).to.equal("namespace/image:tag")
    })

    it("should correctly compose an id with a host and namespace", () => {
      expect(helpers.unparseImageId({
        host: "my-host.com",
        namespace: "namespace",
        repository: "image",
        tag: "tag",
      })).to.equal("my-host.com/namespace/image:tag")
    })

    it("should set a default namespace when host but no namespace is specified", () => {
      expect(helpers.unparseImageId({
        host: "my-host.com",
        repository: "image",
        tag: "tag",
      })).to.equal("my-host.com/_/image:tag")
    })

    it("should correctly compose an id with a host and multi-level namespace", () => {
      expect(helpers.unparseImageId({
        host: "my-host.com",
        namespace: "a/b/c/d",
        repository: "image",
        tag: "tag",
      })).to.equal("my-host.com/a/b/c/d/image:tag")
    })

    it("should throw on an empty name", async () => {
      await expectError(() => helpers.parseImageId(""), "configuration")
    })
  })

  describe("DockerModuleHandler", () => {
    describe("validate", () => {
      it("should validate and parse a container module", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPublish: false,
          build: {
            dependencies: [],
          },
          apiVersion: "garden.io/v0",
          name: "module-a",
          outputs: {},
          path: modulePath,
          type: "container",

          spec: {
            build: { dependencies: [] },
            buildArgs: {},
            services: [{
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
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
                httpGet: {
                  path: "/health",
                  port: "http",
                },
              },
              limits: {
                cpu: 123,
                memory: 456,
              },
              ports: [{
                name: "http",
                protocol: "TCP",
                containerPort: 8080,
                servicePort: 8080,
              }],
              volumes: [],
            }],
            tasks: [{
              name: "task-a",
              args: ["echo", "OK"],
              dependencies: [],
              env: {
                TASK_ENV_VAR: "value",
              },
              timeout: null,
            }],
            tests: [{
              name: "unit",
              args: ["echo", "OK"],
              dependencies: [],
              env: {
                TEST_ENV_VAR: "value",
              },
              timeout: null,
            }],
          },

          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
        }

        const result = await configure({ ctx, moduleConfig, log })

        expect(result).to.eql({
          allowPublish: false,
          build: { dependencies: [] },
          apiVersion: "garden.io/v0",
          name: "module-a",
          outputs: {
            "local-image-name": "module-a",
            "deployment-image-name": "module-a",
          },
          path: modulePath,
          type: "container",
          spec:
          {
            build: { dependencies: [] },
            buildArgs: {},
            services:
              [{
                name: "service-a",
                annotations: {},
                args: ["echo"],
                dependencies: [],
                daemon: false,
                ingresses: [{
                  annotations: {},
                  path: "/",
                  port: "http",
                }],
                env: {
                  SOME_ENV_VAR: "value",
                },
                healthCheck:
                  { httpGet: { path: "/health", port: "http" } },
                limits: {
                  cpu: 123,
                  memory: 456,
                },
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080, servicePort: 8080 }],
                volumes: [],
              }],
            tasks:
              [{
                name: "task-a",
                args: ["echo", "OK"],
                dependencies: [],
                env: {
                  TASK_ENV_VAR: "value",
                },
                timeout: null,
              }],
            tests:
              [{
                name: "unit",
                args: ["echo", "OK"],
                dependencies: [],
                env: {
                  TEST_ENV_VAR: "value",
                },
                timeout: null,
              }],
          },
          serviceConfigs:
            [{
              name: "service-a",
              dependencies: [],
              hotReloadable: false,
              spec:
              {
                name: "service-a",
                annotations: {},
                args: ["echo"],
                dependencies: [],
                daemon: false,
                ingresses: [{
                  annotations: {},
                  path: "/",
                  port: "http",
                }],
                env: {
                  SOME_ENV_VAR: "value",
                },
                healthCheck:
                  { httpGet: { path: "/health", port: "http" } },
                limits: {
                  cpu: 123,
                  memory: 456,
                },
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080, servicePort: 8080 }],
                volumes: [],
              },
            }],
          taskConfigs:
            [{
              dependencies: [],
              name: "task-a",
              spec: {
                args: [
                  "echo",
                  "OK",
                ],
                dependencies: [],
                env: {
                  TASK_ENV_VAR: "value",
                },
                name: "task-a",
                timeout: null,
              },
              timeout: null,
            }],
          testConfigs:
            [{
              name: "unit",
              dependencies: [],
              spec:
              {
                name: "unit",
                args: ["echo", "OK"],
                dependencies: [],
                env: {
                  TEST_ENV_VAR: "value",
                },
                timeout: null,
              },
              timeout: null,
            }],
        })
      })

      it("should fail with invalid port in ingress spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPublish: false,
          build: {
            dependencies: [],
          },
          apiVersion: "garden.io/v0",
          name: "module-a",
          outputs: {},
          path: modulePath,
          type: "test",

          spec: {
            build: { dependencies: [] },
            buildArgs: {},
            services: [{
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
              daemon: false,
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
              volumes: [],
            }],
            tasks: [{
              name: "task-a",
              args: ["echo"],
              dependencies: [],
              env: {},
              timeout: null,
            }],
            tests: [{
              name: "unit",
              args: ["echo", "OK"],
              dependencies: [],
              env: {},
              timeout: null,
            }],
          },

          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
        }

        await expectError(
          () => configure({ ctx, moduleConfig, log }),
          "configuration",
        )
      })

      it("should fail with invalid port in httpGet healthcheck spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPublish: false,
          build: {
            dependencies: [],
          },
          apiVersion: "garden.io/v0",
          name: "module-a",
          outputs: {},
          path: modulePath,
          type: "test",

          spec: {
            build: { dependencies: [] },
            buildArgs: {},
            services: [{
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
              daemon: false,
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
              volumes: [],
            }],
            tasks: [{
              name: "task-a",
              args: ["echo"],
              dependencies: [],
              env: {},
              timeout: null,
            }],
            tests: [],
          },

          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
        }

        await expectError(
          () => configure({ ctx, moduleConfig, log }),
          "configuration",
        )
      })

      it("should fail with invalid port in tcpPort healthcheck spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPublish: false,
          build: {
            dependencies: [],
          },
          apiVersion: "garden.io/v0",
          name: "module-a",
          outputs: {},
          path: modulePath,
          type: "test",

          spec: {
            build: { dependencies: [] },
            buildArgs: {},
            services: [{
              name: "service-a",
              annotations: {},
              args: ["echo"],
              dependencies: [],
              daemon: false,
              ingresses: [],
              env: {},
              healthCheck: {
                tcpPort: "bla",
              },
              limits: defaultContainerLimits,
              ports: [],
              volumes: [],
            }],
            tasks: [{
              name: "task-a",
              args: ["echo"],
              dependencies: [],
              env: {},
              timeout: null,
            }],
            tests: [],
          },

          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
        }

        await expectError(
          () => configure({ ctx, moduleConfig, log }),
          "configuration",
        )
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
          fresh: true,
          details: { identifier: "some/image" },
        })

        td.verify(dockerCli(module, ["build", "-t", "some/image", module.buildPath]))
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
          fresh: true,
          details: { identifier: "some/image" },
        })

        td.verify(dockerCli(module, ["build", "-t", "some/image", "--target", "foo", module.buildPath]))
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
        td.verify(dockerCli(module, cmdArgs))
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

    describe("getDockerVersion", () => {
      it("should get the current docker version", async () => {
        const { clientVersion, serverVersion } = await helpers.getDockerVersion()
        expect(clientVersion).to.be.ok
        expect(serverVersion).to.be.ok
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
          (err) => { expect(err.message).to.equal("Docker client needs to be version 17.07.0 or newer (got 17.06)") },
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
          (err) => { expect(err.message).to.equal("Docker server needs to be version 17.07.0 or newer (got 17.06)") },
        )
      })
    })
  })
})
