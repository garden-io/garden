import { expect } from "chai"
import { resolve } from "path"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { PluginContext } from "../../../src/plugin-context"
import {
  ContainerModuleConfig,
  gardenPlugin,
  helpers,
} from "../../../src/plugins/container"
import { Environment } from "../../../src/config/common"
import {
  dataDir,
  expectError,
  makeTestGarden,
} from "../../helpers"
import { moduleFromConfig } from "../../../src/types/module"

describe("plugins.container", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const modulePath = resolve(dataDir, "test-project-container", "module-a")

  const handler = gardenPlugin()
  const parseModule = handler.moduleActions!.container!.parseModule!
  const buildModule = handler.moduleActions!.container!.buildModule!
  const pushModule = handler.moduleActions!.container!.pushModule!
  const getModuleBuildStatus = handler.moduleActions!.container!.getModuleBuildStatus!

  let garden: Garden
  let ctx: PluginContext
  let env: Environment

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, [gardenPlugin])
    ctx = garden.getPluginContext()
    env = garden.getEnvironment()

    td.replace(garden.buildDir, "syncDependencyProducts", () => null)

    td.replace(Garden.prototype, "resolveVersion", async () => ({
      versionString: "1234",
      dirtyTimestamp: null,
      dependencyVersions: [],
    }))
  })

  const provider = { name: "container", config: {} }

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    const parsed = await parseModule({ env, provider, moduleConfig })
    return moduleFromConfig(garden, parsed)
  }

  describe("helpers", () => {
    describe("getLocalImageId", () => {
      it("should create identifier with commit hash version if module has a Dockerfile", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image:1.1",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        })

        td.replace(helpers, "hasDockerfile", async () => true)

        expect(await helpers.getLocalImageId(module)).to.equal("test:1234")
      })

      it("should create identifier with image name if module has no Dockerfile", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image:1.1",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        })

        td.replace(helpers, "hasDockerfile", async () => false)

        expect(await helpers.getLocalImageId(module)).to.equal("some/image:1.1")
      })
    })

    describe("getRemoteImageId", () => {
      it("should use image name including version if specified", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image:1.1",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        })

        expect(await helpers.getRemoteImageId(module)).to.equal("some/image:1.1")
      })

      it("should use image name if specified with commit hash if no version is set", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        })

        expect(await helpers.getRemoteImageId(module)).to.equal("some/image:1234")
      })

      it("should use local id if no image name is set", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        })

        td.replace(helpers, "getLocalImageId", async () => "test:1234")

        expect(await helpers.getRemoteImageId(module)).to.equal("test:1234")
      })
    })
  })

  describe("DockerModuleHandler", () => {
    describe("parseModule", () => {
      it("should validate and parse a container module", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: ["echo", "OK"],
            dependencies: [],
          },
          name: "module-a",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            services: [{
              name: "service-a",
              command: ["echo"],
              dependencies: [],
              daemon: false,
              endpoints: [
                {
                  name: "default",
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
              ports: [{
                name: "http",
                protocol: "TCP",
                containerPort: 8080,
              }],
              outputs: {},
              volumes: [],
            }],
            tests: [{
              name: "unit",
              command: ["echo", "OK"],
              dependencies: [],
              env: {},
              timeout: null,
            }],
          },

          serviceConfigs: [],
          testConfigs: [],
        }

        const result = await parseModule({ env, provider, moduleConfig })

        expect(result).to.eql({
          allowPush: false,
          build: { command: ["echo", "OK"], dependencies: [] },
          name: "module-a",
          path: modulePath,
          type: "container",
          variables: {},
          spec:
          {
            buildArgs: {},
            services:
              [{
                name: "service-a",
                command: ["echo"],
                dependencies: [],
                daemon: false,
                endpoints: [{
                  name: "default",
                  path: "/",
                  port: "http",
                }],
                env: {
                  SOME_ENV_VAR: "value",
                },
                healthCheck:
                  { httpGet: { path: "/health", port: "http", scheme: "HTTP" } },
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080 }],
                outputs: {},
                volumes: [],
              }],
            tests:
              [{
                name: "unit",
                command: ["echo", "OK"],
                dependencies: [],
                env: {},
                timeout: null,
              }],
          },
          serviceConfigs:
            [{
              name: "service-a",
              dependencies: [],
              outputs: {},
              spec:
              {
                name: "service-a",
                command: ["echo"],
                dependencies: [],
                daemon: false,
                endpoints: [{
                  name: "default",
                  path: "/",
                  port: "http",
                }],
                env: {
                  SOME_ENV_VAR: "value",
                },
                healthCheck:
                  { httpGet: { path: "/health", port: "http", scheme: "HTTP" } },
                ports: [{ name: "http", protocol: "TCP", containerPort: 8080 }],
                outputs: {},
                volumes: [],
              },
            }],
          testConfigs:
            [{
              name: "unit",
              dependencies: [],
              spec:
              {
                name: "unit",
                command: ["echo", "OK"],
                dependencies: [],
                env: {},
                timeout: null,
              },
              timeout: null,
            }],
        })
      })

      it("should fail with invalid port in endpoint spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: ["echo", "OK"],
            dependencies: [],
          },
          name: "module-a",
          path: modulePath,
          type: "test",
          variables: {},

          spec: {
            buildArgs: {},
            services: [{
              name: "service-a",
              command: ["echo"],
              dependencies: [],
              daemon: false,
              endpoints: [
                {
                  name: "bla",
                  path: "/",
                  port: "bla",
                },
              ],
              env: {},
              ports: [],
              outputs: {},
              volumes: [],
            }],
            tests: [{
              name: "unit",
              command: ["echo", "OK"],
              dependencies: [],
              env: {},
              timeout: null,
            }],
          },

          serviceConfigs: [],
          testConfigs: [],
        }

        await expectError(
          () => parseModule({ env, provider, moduleConfig }),
          "configuration",
        )
      })

      it("should fail with invalid port in httpGet healthcheck spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: ["echo", "OK"],
            dependencies: [],
          },
          name: "module-a",
          path: modulePath,
          type: "test",
          variables: {},

          spec: {
            buildArgs: {},
            services: [{
              name: "service-a",
              command: ["echo"],
              dependencies: [],
              daemon: false,
              endpoints: [],
              env: {},
              healthCheck: {
                httpGet: {
                  path: "/",
                  port: "bla",
                },
              },
              ports: [],
              outputs: {},
              volumes: [],
            }],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }

        await expectError(
          () => parseModule({ env, provider, moduleConfig }),
          "configuration",
        )
      })

      it("should fail with invalid port in tcpPort healthcheck spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: ["echo", "OK"],
            dependencies: [],
          },
          name: "module-a",
          path: modulePath,
          type: "test",
          variables: {},

          spec: {
            buildArgs: {},
            services: [{
              name: "service-a",
              command: ["echo"],
              dependencies: [],
              daemon: false,
              endpoints: [],
              env: {},
              healthCheck: {
                tcpPort: "bla",
              },
              ports: [],
              outputs: {},
              volumes: [],
            }],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }

        await expectError(
          () => parseModule({ env, provider, moduleConfig }),
          "configuration",
        )
      })
    })

    describe("getModuleBuildStatus", () => {
      it("should return ready:true if build exists locally", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "imageExistsLocally", async () => true)

        const result = await getModuleBuildStatus({ ctx, env, provider, module })
        expect(result).to.eql({ ready: true })
      })

      it("should return ready:false if build does not exist locally", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "imageExistsLocally", async () => false)

        const result = await getModuleBuildStatus({ ctx, env, provider, module })
        expect(result).to.eql({ ready: false })
      })
    })

    describe("buildModule", () => {
      it("pull image if image tag is set and the module doesn't container a Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "hasDockerfile", async () => false)
        td.replace(helpers, "pullImage", async () => null)
        td.replace(helpers, "imageExistsLocally", async () => false)

        const result = await buildModule({ ctx, env, provider, module })

        expect(result).to.eql({ fetched: true })
      })

      it("build image if module contains Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "hasDockerfile", async () => true)
        td.replace(helpers, "imageExistsLocally", async () => false)
        td.replace(helpers, "getLocalImageId", async () => "some/image")

        const dockerCli = td.replace(helpers, "dockerCli")

        const result = await buildModule({ ctx, env, provider, module })

        expect(result).to.eql({
          fresh: true,
          details: { identifier: "some/image" },
        })

        td.verify(dockerCli(module, "build  -t some/image " + module.buildPath))
      })
    })

    describe("pushModule", () => {
      it("not push image if module doesn't container a Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "hasDockerfile", async () => false)

        const result = await pushModule({ ctx, env, provider, module })
        expect(result).to.eql({ pushed: false })
      })

      it("push image if module contains a Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image:1.1",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "hasDockerfile", async () => true)
        td.replace(helpers, "getLocalImageId", async () => "some/image:12345")
        td.replace(helpers, "getRemoteImageId", async () => "some/image:12345")

        const dockerCli = td.replace(helpers, "dockerCli")

        const result = await pushModule({ ctx, env, provider, module })
        expect(result).to.eql({ pushed: true })

        td.verify(dockerCli(module, "tag some/image:12345 some/image:12345"), { times: 0 })
        td.verify(dockerCli(module, "push some/image:12345"))
      })

      it("tag image if remote id differs from local id", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            command: [],
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          type: "container",
          variables: {},

          spec: {
            buildArgs: {},
            image: "some/image:1.1",
            services: [],
            tests: [],
          },

          serviceConfigs: [],
          testConfigs: [],
        }))

        td.replace(helpers, "hasDockerfile", async () => true)
        td.replace(helpers, "getLocalImageId", () => "some/image:12345")
        td.replace(helpers, "getRemoteImageId", () => "some/image:1.1")

        const dockerCli = td.replace(helpers, "dockerCli")

        const result = await pushModule({ ctx, env, provider, module })
        expect(result).to.eql({ pushed: true })

        td.verify(dockerCli(module, "tag some/image:12345 some/image:1.1"))
        td.verify(dockerCli(module, "push some/image:1.1"))
      })
    })
  })
})
