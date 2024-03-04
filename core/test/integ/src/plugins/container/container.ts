/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import sinon from "sinon"
import * as td from "testdouble"

import type { PluginContext } from "../../../../../src/plugin-context.js"
import type { ContainerProvider } from "../../../../../src/plugins/container/container.js"
import { gardenPlugin } from "../../../../../src/plugins/container/container.js"
import type { TestGarden } from "../../../../helpers.js"
import { expectError, getDataDir, makeTestGarden } from "../../../../helpers.js"
import type { ActionLog } from "../../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../../src/logger/log-entry.js"
import { expect } from "chai"
import type {
  ContainerBuildAction,
  ContainerBuildActionSpec,
} from "../../../../../src/plugins/container/moduleConfig.js"
import cloneDeep from "fast-copy"

import { publishContainerBuild } from "../../../../../src/plugins/container/publish.js"
import type { Executed } from "../../../../../src/actions/types.js"
import type { BuildActionConfig } from "../../../../../src/actions/build.js"
import { containerHelpers, minDockerVersion } from "../../../../../src/plugins/container/helpers.js"
import { getDockerBuildFlags } from "../../../../../src/plugins/container/build.js"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../../../src/constants.js"

const testVersionedId = "some/image:12345"

describe("plugins.container", () => {
  const projectRoot = getDataDir("test-project-container")

  const baseConfig: BuildActionConfig<"container", ContainerBuildActionSpec> = {
    name: "test",
    kind: "Build",
    type: "container",
    timeout: DEFAULT_BUILD_TIMEOUT_SEC,
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
  let log: ActionLog
  let containerProvider: ContainerProvider

  let dockerCli: sinon.SinonStub<any, any>

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = createActionLog({ log: garden.log, actionName: "", actionKind: "" })
    containerProvider = await garden.resolveProvider(garden.log, "container")
    ctx = await garden.getPluginContext({ provider: containerProvider, templateContext: undefined, events: undefined })
    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
  })

  afterEach(() => {
    sinon.restore()
  })

  async function getTestBuild(cfg: BuildActionConfig): Promise<Executed<ContainerBuildAction>> {
    sinon.replace(containerHelpers, "actionHasDockerfile", async () => true)

    dockerCli = sinon.stub(containerHelpers, "dockerCli")
    dockerCli.returns(
      Promise.resolve({
        all: "test log",
        stdout: testVersionedId,
        stderr: "",
        code: 0,
        proc: <any>null,
      })
    )

    garden.setActionConfigs([cfg])
    const graph = await garden.getConfigGraph({ emit: false, log })
    const build = graph.getBuild(cfg.name)
    const resolved = await garden.resolveAction({ action: build, graph, log })
    return garden.executeAction({ action: resolved, graph, log })
  }

  describe("publishContainerBuild", () => {
    it("should tag image if remote id differs from local id", async () => {
      const publishId = "some/image:1.1"

      const config = cloneDeep(baseConfig)

      config.spec.publishId = publishId

      const action = await getTestBuild(config)

      sinon.replace(action, "getOutput", (o: string) =>
        o === "localImageId" ? testVersionedId : action.getOutput(<any>o)
      )
      sinon.restore()

      const dockerCli = sinon.stub(containerHelpers, "dockerCli")

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result.detail).to.eql({ message: "Published some/image:1.1", published: true })

      sinon.assert.calledWithMatch(dockerCli.firstCall, {
        cwd: action.getBuildPath(),
        args: ["tag", action.getOutput("local-image-id"), publishId],
      })

      sinon.assert.calledWithMatch(dockerCli.secondCall, {
        cwd: action.getBuildPath(),
        args: ["push", publishId],
      })
    })

    it("should use specified tag if provided", async () => {
      const config = cloneDeep(baseConfig)
      const action = td.object(await getTestBuild(config))

      sinon.restore()

      sinon.replace(action, "getOutput", (o: string) =>
        o === "localImageId" ? testVersionedId : action.getOutput(<any>o)
      )

      sinon.replace(containerHelpers, "actionHasDockerfile", async () => true)

      const dockerCli = sinon.stub(containerHelpers, "dockerCli")

      const result = await publishContainerBuild({ ctx, log, action, tagOverride: "custom-tag" })
      expect(result.detail).to.eql({ message: "Published test:custom-tag", published: true })

      sinon.assert.calledWith(
        dockerCli,
        sinon.match({
          cwd: action.getBuildPath(),
          args: ["tag", testVersionedId, "test:custom-tag"],
        })
      )

      sinon.assert.calledWith(
        dockerCli,
        sinon.match({
          cwd: action.getBuildPath(),
          args: ["push", "test:custom-tag"],
        })
      )
    })

    describe("publish image id", () => {
      let action: Executed<ContainerBuildAction>

      function assertPublishId(publishId: string, detail: { message?: string; published: boolean } | null) {
        expect(detail).to.eql({ message: `Published ${publishId}`, published: true })

        sinon.assert.calledWith(
          dockerCli,
          sinon.match({
            cwd: action.getBuildPath(),
            args: ["push", publishId],
          })
        )
      }

      it("should use spec.publishId if defined", async () => {
        const config = cloneDeep(baseConfig)
        config.spec.publishId = testVersionedId

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId("some/image:12345", result.detail)
      })

      it("should fall back to spec.localId if spec.publishId is not defined", async () => {
        const config = cloneDeep(baseConfig)
        config.spec.localId = "private-registry/foobar"

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId(`private-registry/foobar:${action.versionString()}`, result.detail)
      })

      it("should fall back to action name if spec.localId and spec.publishId are not defined", async () => {
        const config = cloneDeep(baseConfig)

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId(`test:${action.versionString()}`, result.detail)
      })

      it("should respect tagOverride, which corresponds to garden publish --tag command line option", async () => {
        const config = cloneDeep(baseConfig)

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action, tagOverride: "custom-version" })
        assertPublishId(`test:custom-version`, result.detail)
      })

      it("tagOverride has precedence over spec.publishId", async () => {
        const config = cloneDeep(baseConfig)
        config.spec.publishId = "some/image:1.1"

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action, tagOverride: "custom-version" })
        assertPublishId(`some/image:custom-version`, result.detail)
      })
    })
  })

  describe("checkDockerServerVersion", () => {
    it("should return if server version is equal to the minimum version", async () => {
      containerHelpers.checkDockerServerVersion(minDockerVersion, log)
    })

    it("should return if server version is greater than the minimum version", async () => {
      const version = {
        client: "99.99",
        server: "99.99",
      }

      containerHelpers.checkDockerServerVersion(version, log)
    })

    // see https://github.com/garden-io/garden/issues/5284
    it("should print a warning message if server returns an unparsable server version", async () => {
      const version = {
        client: "99.99",
        server: "dev",
      }

      expect(() => containerHelpers.checkDockerServerVersion(version, log)).to.not.throw()
      expect(log.entries[0].msg).to.equal(
        "Failed to parse Docker server version: dev. Please check your Docker installation. A docker factory reset may be required."
      )
    })

    it("should throw if server is not reachable (version is undefined)", async () => {
      const version = {
        client: minDockerVersion.client,
        server: undefined,
      }

      await expectError(
        () => containerHelpers.checkDockerServerVersion(version, log),
        (err) => {
          expect(err.message).to.equal(
            "Failed to check Docker server version: Docker server is not running or cannot be reached."
          )
        }
      )
    })

    it("should throw if server version is too old", async () => {
      const version = {
        client: minDockerVersion.client,
        server: "17.06",
      }

      await expectError(
        () => containerHelpers.checkDockerServerVersion(version, log),
        (err) => {
          expect(err.message).to.equal("Docker server needs to be version 17.07.0 or newer (got 17.06)")
        }
      )
    })
  })

  describe("getDockerBuildFlags", () => {
    it("should include extraFlags", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.extraFlags = ["--cache-from", "some-image:latest"]

      const buildAction = await getTestBuild(config)
      const resolvedBuild = await garden.resolveAction({
        action: buildAction,
        log,
        graph: await garden.getConfigGraph({ log, emit: false }),
      })

      const args = getDockerBuildFlags(resolvedBuild)

      expect(args.slice(-2)).to.eql(["--cache-from", "some-image:latest"])
    })

    it("should set GARDEN_ACTION_VERSION", async () => {
      const config = cloneDeep(baseConfig)

      const buildAction = await getTestBuild(config)

      const resolvedBuild = await garden.resolveAction({
        action: buildAction,
        log,
        graph: await garden.getConfigGraph({ log, emit: false }),
      })

      const args = getDockerBuildFlags(resolvedBuild)

      // Also module version is set for backwards compatability
      expect(args.slice(0, 2)).to.eql(["--build-arg", `GARDEN_MODULE_VERSION=${buildAction.versionString()}`])
      expect(args.slice(2, 4)).to.eql(["--build-arg", `GARDEN_ACTION_VERSION=${buildAction.versionString()}`])
    })
  })
})
