/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"

import { PluginContext } from "../../../../../src/plugin-context"
import { gardenPlugin, ContainerProvider } from "../../../../../src/plugins/container/container"
import { expectError, getDataDir, getPropertyName, makeTestGarden, TestGarden } from "../../../../helpers"
import { Log } from "../../../../../src/logger/log-entry"
import { expect } from "chai"
import { ContainerBuildAction, ContainerBuildActionSpec } from "../../../../../src/plugins/container/moduleConfig"
import { cloneDeep } from "lodash"
import { publishContainerBuild } from "../../../../../src/plugins/container/publish"
import { Executed } from "../../../../../src/actions/types"
import { BuildActionConfig } from "../../../../../src/actions/build"
import { containerHelpers, minDockerVersion } from "../../../../../src/plugins/container/helpers"
import { getDockerBuildFlags } from "../../../../../src/plugins/container/build"

describe("plugins.container", () => {
  const unmodifiedHelpers = cloneDeep(containerHelpers)
  const projectRoot = getDataDir("test-project-container")

  const baseConfig: BuildActionConfig<"container", ContainerBuildActionSpec> = {
    name: "test",
    kind: "Build",
    type: "container",
    internal: { basePath: "." },
    allowPublish: false,
    spec: {
      dockerfile: "Dockerfile",
      buildArgs: {},
      extraFlags: [],
    },
  }

  let garden: TestGarden
  let ctx: PluginContext
  let log: Log
  let containerProvider: ContainerProvider

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = garden.log
    containerProvider = await garden.resolveProvider(garden.log, "container")
    ctx = await garden.getPluginContext({ provider: containerProvider, templateContext: undefined, events: undefined })
    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
  })

  after(async () => {
    td.reset()
    // The line above does not successfully reset the mocks so this is needed instead
    Object.keys(containerHelpers).forEach((key) => (containerHelpers[key] = unmodifiedHelpers[key]))
  })

  async function getTestBuild(cfg: BuildActionConfig): Promise<Executed<ContainerBuildAction>> {
    td.replace(
      containerHelpers,
      getPropertyName(containerHelpers, (h) => h.actionHasDockerfile),
      () => true
    )
    td.replace(
      containerHelpers,
      getPropertyName(containerHelpers, (h) => h.dockerCli),
      () => ({ all: "test log", stdout: "some/image:12345" })
    )

    garden.setActionConfigs([cfg])
    const graph = await garden.getConfigGraph({ emit: false, log })
    const build = graph.getBuild(cfg.name)
    const resolved = await garden.resolveAction({ action: build, graph, log })
    return garden.executeAction({ action: resolved, graph, log })
  }

  describe("publishContainerBuild", () => {
    it("should publish image", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.localId = "some/image:12345"
      const action = td.object(await getTestBuild(config))

      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.actionHasDockerfile),
        () => true
      )
      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.getPublicImageId),
        () => "some/image:12345"
      )

      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.dockerCli),
        async ({ cwd, args, ctx: _ctx }) => {
          if (args[0] === "tag") {
            return { all: "log" }
          }
          expect(cwd).to.equal(action.getBuildPath())
          expect(args).to.eql(["push", "some/image:12345"])
          expect(_ctx).to.exist
          return { all: "log" }
        }
      )

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result.detail).to.eql({ message: "Published some/image:12345", published: true })
    })

    it("should tag image if remote id differs from local id", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.localId = "some/image:12345"
      const action = td.object(await getTestBuild(config))

      td.replace(action, "getOutput", (o: string) =>
        o === "localImageId" ? "some/image:12345" : action.getOutput(<any>o)
      )
      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.getPublicImageId),
        () => "some/image:1.1"
      )

      const dockerCli = td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.dockerCli)
      )

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result.detail).to.eql({ message: "Published some/image:1.1", published: true })

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
      const action = td.object(await getTestBuild(config))

      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.actionHasDockerfile),
        () => true
      )

      td.replace(action, "getOutput", (o: string) =>
        o === "localImageId" ? "some/image:12345" : action.getOutput(<any>o)
      )

      const dockerCli = td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.dockerCli)
      )

      const result = await publishContainerBuild({ ctx, log, action, tag: "custom-tag" })
      expect(result.detail).to.eql({ message: "Published test:custom-tag", published: true })

      td.verify(
        dockerCli({
          cwd: action.getBuildPath(),
          args: ["tag", "some/image:12345", "test:custom-tag"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )

      td.verify(
        dockerCli({
          cwd: action.getBuildPath(),
          args: ["push", "test:custom-tag"],
          log: td.matchers.anything(),
          ctx: td.matchers.anything(),
        })
      )
    })
  })

  describe("checkDockerServerVersion", () => {
    it("should return if server version is equal to the minimum version", async () => {
      containerHelpers.checkDockerServerVersion(minDockerVersion)
    })

    it("should return if server version is greater than the minimum version", async () => {
      const version = {
        client: "99.99",
        server: "99.99",
      }

      containerHelpers.checkDockerServerVersion(version)
    })

    it("should throw if server is not reachable (version is undefined)", async () => {
      const version = {
        client: minDockerVersion.client,
        server: undefined,
      }

      await expectError(
        () => containerHelpers.checkDockerServerVersion(version),
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
        () => containerHelpers.checkDockerServerVersion(version),
        (err) => {
          expect(err.message).to.equal("Docker server needs to be version 17.07.0 or newer (got 17.06)")
        }
      )
    })
  })

  describe("getDockerBuildFlags", () => {
    it("should include extraFlags", async () => {
      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.actionHasDockerfile),
        () => true
      )
      const config = cloneDeep(baseConfig)
      config.spec.extraFlags = ["--cache-from", "some-image:latest"]

      const buildAction = await getTestBuild(config)
      const resolvedBuild = await garden.resolveAction({ action: buildAction, log })

      const args = getDockerBuildFlags(resolvedBuild)

      expect(args.slice(-2)).to.eql(["--cache-from", "some-image:latest"])
    })

    it("should set GARDEN_ACTION_VERSION", async () => {
      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (h) => h.actionHasDockerfile),
        () => true
      )
      const config = cloneDeep(baseConfig)

      const buildAction = await getTestBuild(config)

      const resolvedBuild = await garden.resolveAction({ action: buildAction, log })

      const args = getDockerBuildFlags(resolvedBuild)

      // Also module version is set for backwards compatability
      expect(args.slice(0, 2)).to.eql(["--build-arg", `GARDEN_MODULE_VERSION=${buildAction.versionString()}`])
      expect(args.slice(2, 4)).to.eql(["--build-arg", `GARDEN_ACTION_VERSION=${buildAction.versionString()}`])
    })
  })
})
