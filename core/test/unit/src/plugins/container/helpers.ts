/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import cloneDeep from "fast-copy"

import * as td from "testdouble"
import tmp from "tmp-promise"
import fsExtra from "fs-extra"
const { writeFile, mkdir } = fsExtra

import { Garden } from "../../../../../src/garden.js"
import type { PluginContext } from "../../../../../src/plugin-context.js"
import { gardenPlugin } from "../../../../../src/plugins/container/container.js"
import { expectError, getDataDir, getPropertyName, makeTestGarden } from "../../../../helpers.js"
import { moduleFromConfig } from "../../../../../src/types/module.js"
import type { ModuleConfig } from "../../../../../src/config/module.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import type { ContainerModuleSpec, ContainerModuleConfig } from "../../../../../src/plugins/container/moduleConfig.js"
import { defaultDockerfileName } from "../../../../../src/plugins/container/moduleConfig.js"
import { containerHelpers as helpers } from "../../../../../src/plugins/container/helpers.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../../src/constants.js"
import { dedent } from "../../../../../src/util/string.js"
import type { ModuleVersion } from "../../../../../src/vcs/vcs.js"

describe("containerHelpers", () => {
  const projectRoot = getDataDir("test-project-container")
  const modulePath = getDataDir("test-project-container", "module-a")

  const plugin = gardenPlugin()
  const configure = plugin.createModuleTypes![0].handlers.configure!

  const baseConfig: ModuleConfig<ContainerModuleSpec> = {
    allowPublish: false,
    apiVersion: GardenApiVersion.v0,
    build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
    disabled: false,
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

  const dummyVersion: ModuleVersion = {
    contentHash: "1234",
    versionString: "1234",
    dependencyVersions: {},
    files: [],
  }

  let garden: Garden
  let ctx: PluginContext
  let log: Log
  const moduleHasDockerfile = getPropertyName(helpers, (x) => x.moduleHasDockerfile)

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = garden.log
    const provider = await garden.resolveProvider({ log: garden.log, name: "container" })
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
    td.replace(Garden.prototype, "resolveModuleVersion", async () => dummyVersion)
  })

  afterEach(() => {
    garden.close()
  })

  async function getTestModule(moduleConfig: ContainerModuleConfig) {
    const parsed = await configure({ ctx, moduleConfig, log })
    return moduleFromConfig({ garden, log, config: parsed.moduleConfig, buildDependencies: [] })
  }

  describe("getLocalImageId", () => {
    it("should return configured image name if set, with the version as the tag", async () => {
      expect(helpers.getLocalImageId(baseConfig.name, "some/image:1.1", dummyVersion)).to.equal("some/image:1234")
    })

    it("should return build name if image is not specified, with the version as the tag", async () => {
      expect(helpers.getLocalImageId(baseConfig.name, undefined, dummyVersion)).to.equal("test:1234")
    })
  })

  describe("getLocalImageName", () => {
    it("should return explicit image name with no version if specified", async () => {
      td.replace(helpers, moduleHasDockerfile, () => false)

      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"

      expect(helpers.getLocalImageName(config.name, "some/image:1.1")).to.equal("some/image")
    })

    it("should return build name if no image name is specified", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const config = cloneDeep(baseConfig)

      expect(helpers.getLocalImageName(config.name, undefined)).to.equal(config.name)
    })
  })

  describe("getDeploymentImageId", () => {
    it("should return module name with module version if there is a Dockerfile and no image name set", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const config = cloneDeep(baseConfig)
      const module = await getTestModule(config)

      expect(helpers.getModuleDeploymentImageId(config, module.version, undefined)).to.equal("test:1234")
    })

    it("should return image name with module version if there is a Dockerfile and image name is set", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      expect(helpers.getModuleDeploymentImageId(module, module.version, undefined)).to.equal("some/image:1234")
    })

    it("should return configured image tag if there is no Dockerfile", async () => {
      td.replace(helpers, moduleHasDockerfile, () => false)

      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const module = await getTestModule(config)

      expect(helpers.getModuleDeploymentImageId(module, module.version, undefined)).to.equal("some/image:1.1")
    })

    it("should throw if no image name is set and there is no Dockerfile", async () => {
      const config = cloneDeep(baseConfig)

      td.replace(helpers, moduleHasDockerfile, () => false)

      await expectError(() => helpers.getModuleDeploymentImageId(config, dummyVersion, undefined), "configuration")
    })
  })

  describe("getPublicImageId", () => {
    it("should use image name including version if specified", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const graph = await garden.getConfigGraph({ log, emit: false })
      const action = graph.getBuild("module-a")
      action._config.spec.publishId = "some/image:1.1"

      const resolved = await garden.resolveAction({ action, graph, log })
      expect(helpers.getPublicImageId(resolved, log)).to.equal("some/image:1.1")
    })

    it("should use image name if specified with commit hash if no version is set", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const graph = await garden.getConfigGraph({ log, emit: false })
      const action = graph.getBuild("module-a")
      action._config.spec.publishId = "some/image"

      const resolved = await garden.resolveAction({ action, graph, log })

      expect(helpers.getPublicImageId(resolved, log)).to.equal("some/image:" + resolved.versionString(log))
    })

    it("should use local id if no image name is set", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const graph = await garden.getConfigGraph({ log, emit: false })
      const action = graph.getBuild("module-a")

      const resolved = await garden.resolveAction({ action, graph, log })

      expect(helpers.getPublicImageId(resolved, log)).to.equal("module-a:" + resolved.versionString(log))
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
      expect(
        helpers.unparseImageId({
          repository: "image",
          tag: "tag",
        })
      ).to.equal("image:tag")
    })

    it("should correctly compose an id with a namespace", () => {
      expect(
        helpers.unparseImageId({
          namespace: "namespace",
          repository: "image",
          tag: "tag",
        })
      ).to.equal("namespace/image:tag")
    })

    it("should correctly compose an id with a host and namespace", () => {
      expect(
        helpers.unparseImageId({
          host: "my-host.com",
          namespace: "namespace",
          repository: "image",
          tag: "tag",
        })
      ).to.equal("my-host.com/namespace/image:tag")
    })

    it("should ignore the namespace when host but no namespace is specified", () => {
      expect(
        helpers.unparseImageId({
          host: "my-host.com",
          repository: "image",
          tag: "tag",
        })
      ).to.equal("my-host.com/image:tag")
    })

    it("should correctly compose an id with a host and multi-level namespace", () => {
      expect(
        helpers.unparseImageId({
          host: "my-host.com",
          namespace: "a/b/c/d",
          repository: "image",
          tag: "tag",
        })
      ).to.equal("my-host.com/a/b/c/d/image:tag")
    })

    it("should throw on an empty name", async () => {
      await expectError(() => helpers.parseImageId(""), "configuration")
    })
  })

  describe("hasDockerfile", () => {
    it("should return true if module config explicitly sets a Dockerfile", async () => {
      td.replace(helpers, moduleHasDockerfile, () => true)

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("module-a")

      module.spec.dockerfile = defaultDockerfileName

      td.reset()
      expect(helpers.moduleHasDockerfile(module, module.version)).to.be.true
    })

    it("should return true if module sources include a Dockerfile", async () => {
      const config = (await garden.getRawModuleConfigs(["module-a"]))[0]
      const dockerfilePath = join(garden.projectRoot, "module-a", defaultDockerfileName)

      const version = cloneDeep(dummyVersion)
      version.files = [dockerfilePath]

      td.replace(helpers, "getDockerfileSourcePath", () => dockerfilePath)

      expect(helpers.moduleHasDockerfile(config, version)).to.be.true
    })

    it("should return false if no Dockerfile is specified or included in sources", async () => {
      const config = (await garden.getRawModuleConfigs(["module-a"]))[0]
      const dockerfilePath = join(garden.projectRoot, "module-a", defaultDockerfileName)

      td.replace(helpers, "getDockerfileSourcePath", () => dockerfilePath)

      expect(helpers.moduleHasDockerfile(config, dummyVersion)).to.be.false
    })
  })

  describe("autoResolveIncludes", () => {
    let tmpDir: tmp.DirectoryResult
    let config: ContainerModuleConfig
    let dockerfilePath: string

    beforeEach(async () => {
      tmpDir = await tmp.dir({ unsafeCleanup: true })
      dockerfilePath = join(tmpDir.path, defaultDockerfileName)
      config = {
        apiVersion: GardenApiVersion.v0,
        type: "container",
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        name: "test",
        path: tmpDir.path,
        serviceConfigs: [],
        spec: {
          build: { timeout: 999 },
          buildArgs: {},
          extraFlags: [],
          services: [],
          tasks: [],
          tests: [],
        },
        taskConfigs: [],
        testConfigs: [],
      }
    })

    afterEach(async () => {
      await tmpDir.cleanup()
    })

    it("should return empty list if no Dockerfile is not found", async () => {
      expect(await helpers.autoResolveIncludes(config, log)).to.eql([])
    })

    it("should return all paths in COPY and ADD commands + the Dockerfile path", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo

        ADD file-a .
        COPY file-b file-c file-d d/

        ENTRYPOINT bla
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql([
        "file-a",
        "file-b",
        "file-c",
        "file-d",
        defaultDockerfileName,
      ])
    })

    it("should handle array style COPY and ADD commands", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD ["file-a", "."]
        COPY ["file-b", "file-c", "file-d", "d/"]
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql([
        "file-a",
        "file-b",
        "file-c",
        "file-d",
        defaultDockerfileName,
      ])
    })

    it("should ignore URLs", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD http://example.com/bla /
        ADD file-* /
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql(["file-*", defaultDockerfileName])
    })

    it("should pass globs through", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD file-* /
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql(["file-*", defaultDockerfileName])
    })

    it("should handle quoted paths", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD "file-a" /
        ADD 'file-b' /
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql(["file-a", "file-b", defaultDockerfileName])
    })

    it("should ignore --chown arguments", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD --chown=bla file-a /
        COPY --chown=bla file-b file-c /
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql([
        "file-a",
        "file-b",
        "file-c",
        defaultDockerfileName,
      ])
    })

    it("should ignore COPY statements with a --from argument", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD --chown=bla file-a /
        COPY --from=bla /file-b file-c /
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql(["file-a", defaultDockerfileName])
    })

    it("should handle COPY statements with multiple arguments in any order", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD --chown=bla file-a /
        COPY --chown=bla --from=bla /file-b file-c /
        COPY --from=bla --chown=bla  /file-c file-d /
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql(["file-a", "Dockerfile"])
    })

    it("should ignore unknown flag arguments", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD --foo=bla file-a /destination-a
        COPY --bar=bla --keks file-b file-c file-d /destination-b
        COPY --crazynewarg --yes  file-e /destination-c
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql([
        "file-a",
        "file-b",
        "file-c",
        "file-d",
        "file-e",
        "Dockerfile",
      ])
    })

    it("should ignore paths containing a template string", async () => {
      await writeFile(dockerfilePath, "FROM foo\nADD file-a /\nCOPY file-${foo} file-c /")
      expect(await helpers.autoResolveIncludes(config, log)).to.be.undefined
    })

    it("should ignore paths containing a naked template string", async () => {
      await writeFile(dockerfilePath, "FROM foo\nADD file-a /\nCOPY file-$foo file-c /")
      expect(await helpers.autoResolveIncludes(config, log)).to.be.undefined
    })

    it("should pass through paths containing an escaped template string", async () => {
      await writeFile(dockerfilePath, "FROM foo\nADD file-a /\nCOPY file-\\$foo file-c /")
      expect(await helpers.autoResolveIncludes(config, log)).to.eql([
        "file-a",
        "file-$foo",
        "file-c",
        defaultDockerfileName,
      ])
    })

    it("should return if any source path is '.'", async () => {
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD . .
        COPY file-b file-c file-d d/
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.be.undefined
    })

    it("should create a glob for every directory path", async () => {
      await mkdir(join(tmpDir.path, "dir-a"))
      await writeFile(
        dockerfilePath,
        dedent`
        FROM foo
        ADD dir-a .
        COPY file-b d/
        `
      )
      expect(await helpers.autoResolveIncludes(config, log)).to.eql(["dir-a/**/*", "file-b", defaultDockerfileName])
    })
  })
})
