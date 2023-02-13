/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"

import { PluginContext } from "../../../../../src/plugin-context"
import { gardenPlugin, ContainerProvider } from "../../../../../src/plugins/container/container"
import { expectError, getDataDir, makeTestGarden, TestGarden } from "../../../../helpers"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { expect } from "chai"
import { ContainerBuildAction, ContainerModuleConfig } from "../../../../../src/plugins/container/moduleConfig"
import { DEFAULT_BUILD_TIMEOUT, minDockerVersion } from "../../../../../src/plugins/container/helpers"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { resolve } from "path"
import { helpers } from "handlebars"
import { cloneDeep } from "lodash"
import { getDockerBuildFlags } from "../../../../../src/plugins/container/build"
import { publishContainerBuild } from "../../../../../src/plugins/container/publish"
import { Executed } from "../../../../../src/actions/types"

// TODO-G2

describe("plugins.container", () => {
  const projectRoot = getDataDir("test-project-container")
  const modulePath = resolve(projectRoot, "module-a")

  const baseConfig: ContainerModuleConfig = {
    allowPublish: false,
    build: {
      dependencies: [],
    },
    disabled: false,
    apiVersion: DEFAULT_API_VERSION,
    name: "test",
    path: modulePath,
    type: "container",

    spec: {
      build: {
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

  let garden: TestGarden
  let ctx: PluginContext
  let log: LogEntry
  let containerProvider: ContainerProvider
  let graph: ConfigGraph

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = garden.log
    containerProvider = await garden.resolveProvider(garden.log, "container")
    ctx = await garden.getPluginContext({ provider: containerProvider, templateContext: undefined, events: undefined })
    graph = await garden.getConfigGraph({ log, emit: false })
    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
  })

  async function getTestBuild(_): Promise<Executed<ContainerBuildAction>> {
    throw "TODO-G2"
  }

  describe("publishContainerBuild", () => {
    it("should not publish image if module doesn't container a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image"
      const action = td.object(await getTestBuild(config))

      td.replace(helpers, "hasDockerfile", () => false)

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result).to.eql({ published: false })
    })

    it("should publish image if module contains a Dockerfile", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const action = td.object(await getTestBuild(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "getPublicImageId", () => "some/image:12345")

      // module.outputs["local-image-id"] = "some/image:12345"

      td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(action.getBuildPath())
        expect(args).to.eql(["push", "some/image:12345"])
        expect(_ctx).to.exist
        return { all: "log" }
      })

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result).to.eql({ message: "Published some/image:12345", published: true })
    })

    it("should tag image if remote id differs from local id", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const action = td.object(await getTestBuild(config))

      td.replace(helpers, "hasDockerfile", () => true)
      td.replace(helpers, "getPublicImageId", () => "some/image:1.1")

      // action.outputs["local-image-id"] = "some/image:12345"

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result).to.eql({ message: "Published some/image:1.1", published: true })

      td.verify(
        dockerCli({
          cwd: action.getBuildPath(),
          args: ["tag", "some/image:12345", "some/image:1.1"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )

      td.verify(
        dockerCli({
          cwd: action.getBuildPath(),
          args: ["push", "some/image:1.1"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )
    })

    it("should use specified tag if provided", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.image = "some/image:1.1"
      const action = td.object(await getTestBuild(config))

      td.replace(helpers, "hasDockerfile", () => true)

      // action.outputs["local-image-id"] = "some/image:12345"

      const dockerCli = td.replace(helpers, "dockerCli")

      const result = await publishContainerBuild({ ctx, log, action, tag: "custom-tag" })
      expect(result).to.eql({ message: "Published some/image:custom-tag", published: true })

      td.verify(
        dockerCli({
          cwd: action.getBuildPath(),
          args: ["tag", "some/image:12345", "some/image:custom-tag"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )

      td.verify(
        dockerCli({
          cwd: action.getBuildPath(),
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

      const buildAction = await getTestBuild({
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: DEFAULT_API_VERSION,
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
      const resolvedBuild = await garden.resolveAction({ action: buildAction, log })

      const args = getDockerBuildFlags(resolvedBuild)

      expect(args.slice(-2)).to.eql(["--cache-from", "some-image:latest"])
    })

    it("should set GARDEN_ACTION_VERSION", async () => {
      td.replace(helpers, "hasDockerfile", () => true)

      const buildAction = await getTestBuild({
        allowPublish: false,
        build: {
          dependencies: [],
        },
        disabled: false,
        apiVersion: DEFAULT_API_VERSION,
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

      const resolvedBuild = await garden.resolveAction({ action: buildAction, log })

      const args = getDockerBuildFlags(resolvedBuild)

      expect(args.slice(0, 2)).to.eql(["--build-arg", `GARDEN_ACTION_VERSION=${buildAction.versionString()}`])
    })
  })
})
