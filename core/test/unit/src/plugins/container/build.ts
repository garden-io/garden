/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import { ResolvedBuildAction, BuildActionConfig } from "../../../../../src/actions/build"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { PluginContext } from "../../../../../src/plugin-context"
import { buildContainer, getContainerBuildStatus } from "../../../../../src/plugins/container/build"
import { ContainerProvider, gardenPlugin } from "../../../../../src/plugins/container/container"
import { containerHelpers } from "../../../../../src/plugins/container/helpers"
import { joinWithPosix } from "../../../../../src/util/fs"
import { getDataDir, TestGarden, makeTestGarden, getPropertyName } from "../../../../helpers"

context("build.ts", () => {
  const projectRoot = getDataDir("test-project-container")
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
  })

  const getAction = async () => await garden.resolveAction({ action: graph.getBuild("module-a"), log, graph })

  describe("getContainerBuildStatus", () => {
    it("should return ready if build exists locally", async () => {
      const action = await getAction()
      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (c) => c.imageExistsLocally),
        async () => "fake image identifier string"
      )

      const result = await getContainerBuildStatus({ ctx, log, action })
      expect(result.state).to.eql("ready")
    })

    it("should return not-ready if build does not exist locally", async () => {
      const action = await getAction()
      td.replace(
        containerHelpers,
        getPropertyName(containerHelpers, (c) => c.imageExistsLocally),
        async () => null
      )

      const result = await getContainerBuildStatus({ ctx, log, action })
      expect(result.state).to.eql("not-ready")
    })
  })

  describe("buildContainer", () => {
    beforeEach(() => {
      td.replace(containerHelpers, "checkDockerServerVersion", () => null)
    })

    function getCmdArgs(action: ResolvedBuildAction<BuildActionConfig<any, any>, any>, buildPath: string) {
      return [
        "build",
        "-t",
        "some/image",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${action.versionString()}`,
        "--build-arg",
        `GARDEN_BUILD_VERSION=${action.versionString()}`,
        "--file",
        joinWithPosix(action.getBuildPath(), action.getSpec().dockerfile),
        buildPath,
      ]
    }

    it("should build image if module contains Dockerfile", async () => {
      const action = await getAction()

      td.replace(action, "getOutputs", () => ({ localImageId: "some/image" }))

      const buildPath = action.getBuildPath()

      const cmdArgs = getCmdArgs(action, buildPath)
      td.replace(containerHelpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })
      const result = await buildContainer({ ctx, log, action })
      expect(result.state).to.eql("ready")
      expect(result.detail?.buildLog).to.eql("log")
      expect(result.detail?.fresh).to.eql(true)
      expect(result.outputs.localImageId).to.eql("some/image")
    })

    it("should build image using the user specified Dockerfile path", async () => {
      const action = await getAction()
      action.getSpec().dockerfile = "docker-dir/Dockerfile"

      td.replace(action, "getOutputs", () => ({ localImageId: "some/image" }))

      const buildPath = action.getBuildPath()

      const cmdArgs = getCmdArgs(action, buildPath)
      td.replace(containerHelpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(buildPath)
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log" }
      })
      const result = await buildContainer({ ctx, log, action })
      expect(result.state).to.eql("ready")
      expect(result.detail?.buildLog).to.eql("log")
      expect(result.detail?.fresh).to.eql(true)
      expect(result.outputs.localImageId).to.eql("some/image")
    })
  })
})
