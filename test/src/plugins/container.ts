import { expect } from "chai"
import { resolve } from "path"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { PluginContext } from "../../../src/plugin-context"
import {
  ContainerModuleConfig,
  gardenPlugin,
} from "../../../src/plugins/container"
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

  let garden: Garden
  let ctx: PluginContext

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, [gardenPlugin])
    ctx = garden.pluginContext

    td.replace(garden.buildDir, "syncDependencyProducts", () => null)
  })

  afterEach(() => td.reset())

  const provider = { name: "container", config: {} }

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    return parseModule!({ ctx, provider, moduleConfig })
  }

  describe("ContainerModule", () => {
    describe("getLocalImageId", () => {
      it("should create identifier with commit hash version if module has a Dockerfile", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          image: "some/image:1.1",
          services: {},
          test: {},
          type: "container",
          variables: {},
        })

        td.replace(module, "hasDockerfile", () => true)
        td.replace(module, "getVersion", async () => ({ versionString: "1234" }))
        expect(await module.getLocalImageId()).to.equal("test:1234")
      })

      it("should create identifier with image name if module has no Dockerfile", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          image: "some/image:1.1",
          services: {},
          test: {},
          type: "container",
          variables: {},
        })

        td.replace(module, "hasDockerfile", () => false)
        expect(await module.getLocalImageId()).to.equal("some/image:1.1")
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
          image: "some/image:1.1",
          services: {},
          test: {},
          type: "container",
          variables: {},
        })

        expect(await module.getRemoteImageId()).to.equal("some/image:1.1")
      })

      it("should use image name if specified with commit hash if no version is set", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          image: "some/image",
          services: {},
          test: {},
          type: "container",
          variables: {},
        })

        td.replace(module, "getVersion", async () => ({ versionString: "1234" }))
        expect(await module.getRemoteImageId()).to.equal("some/image:1234")
      })

      it("should use local id if no image name is set", async () => {
        const module = await getTestModule({
          allowPush: false,
          build: {
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          services: {},
          test: {},
          type: "container",
          variables: {},
        })

        td.replace(module, "getLocalImageId", async () => "test:1234")
        expect(await module.getRemoteImageId()).to.equal("test:1234")
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
          services: {
            "service-a": {
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
              ports: {
                http: {
                  protocol: "TCP",
                  containerPort: 8080,
                },
              },
              volumes: [],
            },
          },
          test: {
            unit: {
              command: ["echo", "OK"],
              dependencies: [],
              variables: {},
            },
          },
          type: "test",
          variables: {},
        }

        await parseModule({ ctx, provider, moduleConfig })
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
          services: {
            "service-a": {
              command: ["echo"],
              dependencies: [],
              daemon: false,
              endpoints: [
                {
                  paths: ["/"],
                  port: "bla",
                },
              ],
              ports: {},
              volumes: [],
            },
          },
          test: {
            unit: {
              command: ["echo", "OK"],
              dependencies: [],
              variables: {},
            },
          },
          type: "test",
          variables: {},
        }

        await expectError(
          () => parseModule({ ctx, provider, moduleConfig }),
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
          services: {
            "service-a": {
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
              ports: {},
              volumes: [],
            },
          },
          test: {
            unit: {
              command: ["echo", "OK"],
              dependencies: [],
              variables: {},
            },
          },
          type: "test",
          variables: {},
        }

        await expectError(
          () => parseModule({ ctx, provider, moduleConfig }),
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
          services: {
            "service-a": {
              command: ["echo"],
              dependencies: [],
              daemon: false,
              endpoints: [],
              healthCheck: {
                tcpPort: "bla",
              },
              ports: {},
              volumes: [],
            },
          },
          test: {
            unit: {
              command: ["echo", "OK"],
              dependencies: [],
              variables: {},
            },
          },
          type: "test",
          variables: {},
        }

        await expectError(
          () => parseModule({ ctx, provider, moduleConfig }),
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
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.imageExistsLocally()).thenResolve(true)

        const result = await ctx.getModuleBuildStatus(module)

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
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.imageExistsLocally()).thenResolve(false)

        const result = await ctx.getModuleBuildStatus(module)

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
          image: "some/image",
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.hasDockerfile()).thenReturn(false)
        td.when(module.pullImage(ctx)).thenResolve(null)

        const result = await ctx.buildModule(module)

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
          image: "some/image",
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.hasDockerfile()).thenReturn(true)
        td.when(module.getLocalImageId()).thenResolve("some/image")
        td.when(module.getBuildPath()).thenResolve("/tmp/something")

        const result = await ctx.buildModule(module)

        expect(result).to.eql({ fresh: true })

        td.verify(module.dockerCli("build -t some/image /tmp/something"))
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
          image: "some/image",
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.hasDockerfile()).thenReturn(false)

        const result = await ctx.pushModule(module)

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
          image: "some/image:1.1",
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.hasDockerfile()).thenReturn(true)
        td.when(module.getLocalImageId()).thenReturn("some/image:12345")
        td.when(module.getRemoteImageId()).thenReturn("some/image:12345")

        const result = await ctx.pushModule(module)

        expect(result).to.eql({ pushed: true })

        td.verify(module.dockerCli("tag some/image:12345 some/image:12345"), { times: 0 })
        td.verify(module.dockerCli("push some/image:12345"))
      })

      it("tag image if remote id differs from local id", async () => {
        const module = td.object(await getTestModule({
          allowPush: false,
          build: {
            dependencies: [],
          },
          name: "test",
          path: modulePath,
          image: "some/image:1.1",
          services: {},
          test: {},
          type: "container",
          variables: {},
        }))

        td.when(module.hasDockerfile()).thenReturn(true)
        td.when(module.getLocalImageId()).thenReturn("some/image:12345")
        td.when(module.getRemoteImageId()).thenReturn("some/image:1.1")

        const result = await ctx.pushModule(module)

        expect(result).to.eql({ pushed: true })

        td.verify(module.dockerCli("tag some/image:12345 some/image:1.1"))
        td.verify(module.dockerCli("push some/image:1.1"))
      })
    })
  })
})
