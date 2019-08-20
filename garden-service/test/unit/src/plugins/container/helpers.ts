import { expect } from "chai"
import { resolve, join } from "path"
import { cloneDeep } from "lodash"
import * as td from "testdouble"

import { Garden } from "../../../../../src/garden"
import { PluginContext } from "../../../../../src/plugin-context"
import { gardenPlugin } from "../../../../../src/plugins/container/container"
import {
  dataDir,
  expectError,
  makeTestGarden,
} from "../../../../helpers"
import { moduleFromConfig } from "../../../../../src/types/module"
import { ModuleConfig } from "../../../../../src/config/module"
import { LogEntry } from "../../../../../src/logger/log-entry"
import {
  ContainerModuleSpec,
  ContainerModuleConfig,
} from "../../../../../src/plugins/container/config"
import { containerHelpers as helpers, DEFAULT_BUILD_TIMEOUT } from "../../../../../src/plugins/container/helpers"

describe("containerHelpers", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const modulePath = resolve(dataDir, "test-project-container", "module-a")
  const relDockerfilePath = "docker-dir/Dockerfile"

  const handler = gardenPlugin()
  const configure = handler.moduleActions!.container!.configure!

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
    garden = await makeTestGarden(projectRoot, { extraPlugins: { container: gardenPlugin } })
    log = garden.log
    const provider = await garden.resolveProvider("container")
    ctx = await garden.getPluginContext(provider)

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

      expect(await helpers.getDeploymentImageId(module, undefined)).to.equal("test:1234")
    })

    it("should return image name with module version if there is a Dockerfile and image name is set", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => true)

      expect(await helpers.getDeploymentImageId(module, undefined)).to.equal("some/image:1234")
    })

    it("should return configured image tag if there is no Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => false)

      expect(await helpers.getDeploymentImageId(module, undefined)).to.equal("some/image:1.1")
    })

    it("should throw if no image name is set and there is no Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      td.replace(helpers, "hasDockerfile", async () => false)

      await expectError(() => helpers.getDeploymentImageId(module, undefined), "configuration")
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
          build: {
            dependencies: [],
            timeout: DEFAULT_BUILD_TIMEOUT,
          },
          buildArgs: {},
          extraFlags: [],
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

  describe("hasDockerfile", () => {
    it("should return true if module config explicitly sets a Dockerfile", async () => {
      const graph = await garden.getConfigGraph()
      const module = await graph.getModule("module-a")
      module.spec.dockerfile = "Dockerfile"
      expect(await helpers.hasDockerfile(module)).to.be.true
    })

    it("should return true if module sources include a Dockerfile", async () => {
      const graph = await garden.getConfigGraph()
      const module = await graph.getModule("module-a")

      const dockerfilePath = join(module.path, "Dockerfile")
      module.version.files.push(dockerfilePath)
      td.replace(helpers, "getDockerfileSourcePath", () => dockerfilePath)

      expect(await helpers.hasDockerfile(module)).to.be.true
    })

    it("should return false if no Dockerfile is specified or included in sources", async () => {
      const graph = await garden.getConfigGraph()
      const module = await graph.getModule("module-a")

      const dockerfilePath = join(module.path, "Dockerfile")
      td.replace(helpers, "getDockerfileSourcePath", () => dockerfilePath)

      expect(await helpers.hasDockerfile(module)).to.be.false
    })
  })
})
