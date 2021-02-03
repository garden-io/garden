/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve, join } from "path"
import { cloneDeep } from "lodash"
import td from "testdouble"
import tmp from "tmp-promise"

import { Garden } from "../../../../../src/garden"
import {
  gardenPlugin as mavenPlugin,
  MavenContainerModuleSpec,
  MavenContainerModuleConfig,
  prepareBuild,
} from "../../../../../src/plugins/maven-container/maven-container"
import { gardenPlugin as containerPlugin } from "../../../../../src/plugins/container/container"
import { PluginContext } from "../../../../../src/plugin-context"
import { makeTestGarden, dataDir, expectError } from "../../../../helpers"
import { moduleFromConfig, GardenModule } from "../../../../../src/types/module"
import { ModuleConfig } from "../../../../../src/config/module"
import { DEFAULT_BUILD_TIMEOUT } from "../../../../../src/plugins/container/helpers"
import { containerHelpers as helpers } from "../../../../../src/plugins/container/helpers"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { WrappedModuleActionHandler } from "../../../../../src/types/plugin/plugin"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../../../../src/types/plugin/module/configure"
import { BuildModuleParams, BuildResult } from "../../../../../src/types/plugin/module/build"
import { dedent } from "../../../../../src/util/string"
import { pathExists, realpath } from "fs-extra"

describe("maven-container", () => {
  const projectRoot = resolve(dataDir, "test-projects", "maven-container")
  const modulePath = projectRoot

  const plugin = mavenPlugin()
  const basePlugin = containerPlugin()
  const handlers = plugin.createModuleTypes![0].handlers
  const baseHandlers = basePlugin.createModuleTypes![0].handlers
  const build = handlers.build!
  const configure = handlers.configure!
  const configureBase = baseHandlers.configure as WrappedModuleActionHandler<
    ConfigureModuleParams<GardenModule<any, any, any, any>>,
    ConfigureModuleResult<GardenModule<any, any, any, any>>
  >
  const buildBase = baseHandlers.build! as WrappedModuleActionHandler<
    BuildModuleParams<GardenModule<any, any, any, any>>,
    BuildResult
  >

  const baseConfig: ModuleConfig<MavenContainerModuleSpec, any, any> = {
    allowPublish: false,
    build: {
      dependencies: [],
    },
    disabled: false,
    apiVersion: "garden.io/v0",
    name: "test",
    path: modulePath,
    type: "maven-container",

    spec: {
      jarPath: "./sample.jar",
      jdkVersion: 8,
      useDefaultDockerfile: true,
      mvnOpts: [],
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
    garden = await makeTestGarden(projectRoot, { plugins: [mavenPlugin] })
    log = garden.log
    const provider = await garden.resolveProvider(garden.log, "maven-container")
    ctx = await garden.getPluginContext(provider)

    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)

    td.replace(Garden.prototype, "resolveVersion", async () => ({
      versionString: "1234",
      dependencyVersions: {},
      files: [],
    }))
  })

  async function getTestModule(moduleConfig: MavenContainerModuleConfig) {
    const parsed = await configure({ ctx, moduleConfig, log, base: configureBase })
    return moduleFromConfig(garden, log, parsed.moduleConfig, [])
  }

  describe("configure", () => {
    it("should use default Dockerfile if no Dockerfile provided", async () => {
      const config = cloneDeep(baseConfig)
      const parsed = await configure({ ctx, moduleConfig: config, log, base: configureBase })

      expect(parsed.moduleConfig.spec.dockerfile).to.eql("maven-container.Dockerfile")
    })
    it("should use user Dockerfile if provided", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = "Dockerfile"
      const parsed = await configure({ ctx, moduleConfig: config, log, base: configureBase })

      expect(parsed.moduleConfig.spec.dockerfile).to.eql("Dockerfile")
    })
    context("useDefaultDockerfile is false", () => {
      it("should not use default Dockerfile", async () => {
        const config = cloneDeep(baseConfig)
        config.spec.useDefaultDockerfile = false
        const parsedA = await configure({ ctx, moduleConfig: config, log, base: configureBase })

        config.spec.dockerfile = "Dockerfile"

        const parsedB = await configure({ ctx, moduleConfig: config, log, base: configureBase })

        expect(parsedA.moduleConfig.spec.dockerfile).to.eql(undefined)
        expect(parsedB.moduleConfig.spec.dockerfile).to.eql("Dockerfile")
      })
    })
  })
  describe("build", () => {
    context("useDefaultDockerfile is false", () => {
      it("should pull image if image tag is set and the module doesn't contain a Dockerfile", async () => {
        const config = cloneDeep(baseConfig)
        config.spec.useDefaultDockerfile = false
        config.spec.image = "some/image"
        const module = td.object(await getTestModule(config))

        td.replace(helpers, "hasDockerfile", () => false)
        td.replace(helpers, "pullImage", async () => null)
        td.replace(helpers, "imageExistsLocally", async () => false)

        const result = await build({ ctx, log, module, base: buildBase })

        expect(result).to.eql({ fetched: true })
      })
      it("should throw if image tag is not set and the module doesn't contain a Dockerfile", async () => {
        td.replace(helpers, "hasDockerfile", () => true)

        const config = cloneDeep(baseConfig)
        const module = await getTestModule(config)

        module.spec.useDefaultDockerfile = false
        td.reset()
        td.replace(helpers, "hasDockerfile", () => false)

        await expectError(
          () => build({ ctx, log, module, base: buildBase }),
          (err) => {
            expect(err.message).to.eql(dedent`
            The useDefaultDockerfile field is set to false, no Dockerfile was found, and the image field is empty for maven-container module ${module.name}. Please use either the default Dockerfile, your own Dockerfile, or specify an image in the image field.
            `)
          }
        )
      })
    })
  })
  describe("prepareBuild", () => {
    let tmpDir: tmp.DirectoryResult
    let tmpPath: string

    beforeEach(async () => {
      tmpDir = await tmp.dir({ unsafeCleanup: true })
      tmpPath = await realpath(tmpDir.path)
    })

    afterEach(async () => {
      await tmpDir.cleanup()
    })

    it("should copy the default Dockerfile to the build dir if user Docerkfile not provided", async () => {
      const config = cloneDeep(baseConfig)
      const module = td.object(await getTestModule(config))
      module.buildPath = tmpPath
      await prepareBuild(module, log)

      expect(await pathExists(join(module.buildPath, "maven-container.Dockerfile"))).to.be.true
    })
    it("should not copy the default Dockerfile to the build dir if user Docerkfile provided", async () => {
      td.replace(helpers, "hasDockerfile", () => true)
      const config = cloneDeep(baseConfig)
      config.spec.dockerfile = "Dockerfile"
      const module = td.object(await getTestModule(config))
      module.buildPath = tmpPath
      await prepareBuild(module, log)

      expect(await pathExists(join(module.buildPath, "maven-container.Dockerfile"))).to.be.false
    })
    context("useDefaultDockerfile is false", () => {
      it("should not copy the default Dockerfile to the build dir", async () => {
        td.replace(helpers, "hasDockerfile", () => true)
        const config = cloneDeep(baseConfig)
        config.spec.useDefaultDockerfile = false
        const module = td.object(await getTestModule(config))
        module.buildPath = tmpPath
        await prepareBuild(module, log)

        expect(await pathExists(join(module.buildPath, "maven-container.Dockerfile"))).to.be.false
      })
    })
  })
})
