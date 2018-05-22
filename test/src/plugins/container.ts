import { expect } from "chai"
import { resolve } from "path"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { PluginContext } from "../../../src/plugin-context"
import {
  ContainerModule,
  ContainerModuleConfig,
  gardenPlugin,
  helpers,
} from "../../../src/plugins/container"
import { Environment } from "../../../src/types/common"
import {
  dataDir,
  expectError,
  makeTestGarden,
} from "../../helpers"

describe("container", () => {
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
    ctx = garden.pluginContext
    env = garden.getEnvironment()

    td.replace(garden.buildDir, "syncDependencyProducts", () => null)
  })

  afterEach(() => td.reset())

  const provider = { name: "container", config: {} }

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    const parseResults = await parseModule!({ ctx, env, provider, moduleConfig })
    return new ContainerModule(ctx, parseResults.module, parseResults.services, parseResults.tests)
  }

  describe("helpers", () => {
    describe("getLocalImageId", () => {
      it("should create identifier with commit hash version if module has a Dockerfile", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
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
        })

        td.replace(helpers, "hasDockerfile", () => true)
        td.replace(module, "getVersion", async () => ({ versionString: "1234" }))

        expect(await helpers.getLocalImageId(module)).to.equal("test:1234")
      })

      it("should create identifier with image name if module has no Dockerfile", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
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
        })

        td.replace(helpers, "hasDockerfile", () => false)

        expect(await helpers.getLocalImageId(module)).to.equal("some/image:1.1")
      })
    })

    describe("getRemoteImageId", () => {
      it("should use image name including version if specified", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
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
        })

        expect(await helpers.getRemoteImageId(module)).to.equal("some/image:1.1")
      })

      it("should use image name if specified with commit hash if no version is set", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
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
        })

        td.replace(module, "getVersion", async () => ({ versionString: "1234" }))

        expect(await helpers.getRemoteImageId(module)).to.equal("some/image:1234")
      })

      it("should use local id if no image name is set", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
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
        })

        td.replace(helpers, "getLocalImageId", async () => "test:1234")

        expect(await helpers.getRemoteImageId(module)).to.equal("test:1234")
      })
    })
  })

  describe("DockerModuleHandler", () => {
    describe("parseModule", () => {
      it("should validate a container module", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: "echo OK",
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
                  paths: ["/"],
                  port: "http",
                },
              ],
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
              timeout: null,
              variables: {},
            }],
          },
        }

        await parseModule({ ctx, env, provider, moduleConfig })
      })

      it("should fail with invalid port in endpoint spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: "echo OK",
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
                  paths: ["/"],
                  port: "bla",
                },
              ],
              ports: [],
              outputs: {},
              volumes: [],
            }],
            tests: [{
              name: "unit",
              command: ["echo", "OK"],
              dependencies: [],
              timeout: null,
              variables: {},
            }],
          },
        }

        await expectError(
          () => parseModule({ ctx, env, provider, moduleConfig }),
          "configuration",
        )
      })

      it("should fail with invalid port in httpGet healthcheck spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: "echo OK",
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
        }

        await expectError(
          () => parseModule({ ctx, env, provider, moduleConfig }),
          "configuration",
        )
      })

      it("should fail with invalid port in tcpPort healthcheck spec", async () => {
        const moduleConfig: ContainerModuleConfig = {
          allowPush: false,
          build: {
            command: "echo OK",
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
              healthCheck: {
                tcpPort: "bla",
              },
              ports: [],
              outputs: {},
              volumes: [],
            }],
            tests: [],
          },
        }

        await expectError(
          () => parseModule({ ctx, env, provider, moduleConfig }),
          "configuration",
        )
      })
    })

    describe("getModuleBuildStatus", () => {
      it("should return ready:true if build exists locally", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
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
        }))

        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)
        td.replace(helpers, "imageExistsLocally", async () => true)

        const result = await getModuleBuildStatus({ ctx, env, provider, module })
        expect(result).to.eql({ ready: true })
      })

      it("should return ready:false if build does not exist locally", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
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
        }))

        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)
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
        }))

        td.when(module.getVersion()).thenResolve({ versionString: "1234" })
        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)
        td.when(module.getBuildPath()).thenResolve("/tmp/jaoigjwaeoigjweaoglwaeghe")

        td.replace(helpers, "pullImage", async () => null)
        td.replace(helpers, "imageExistsLocally", async () => false)

        const result = await buildModule({ ctx, env, provider, module })

        expect(result).to.eql({ fetched: true })
      })

      it("build image if module contains Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
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
        }))

        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)
        td.when(module.getBuildPath()).thenResolve(modulePath)

        td.replace(helpers, "getLocalImageId", async () => "some/image")

        const dockerCli = td.replace(helpers, "dockerCli")

        const result = await buildModule({ ctx, env, provider, module })

        expect(result).to.eql({
          fresh: true,
          details: { identifier: "some/image" },
        })

        td.verify(dockerCli(module, "build  -t some/image " + modulePath))
      })
    })

    describe("pushModule", () => {
      it("not push image if module doesn't container a Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
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
        }))

        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)

        td.replace(helpers, "hasDockerfile", () => false)

        const result = await pushModule({ ctx, env, provider, module })
        expect(result).to.eql({ pushed: false })
      })

      it("push image if module contains a Dockerfile", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
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
        }))

        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)

        td.replace(helpers, "hasDockerfile", () => true)
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
        }))

        td.when(module.resolveConfig(), { ignoreExtraArgs: true }).thenResolve(module)

        td.replace(helpers, "hasDockerfile", () => true)
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
