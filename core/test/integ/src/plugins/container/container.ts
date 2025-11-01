/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import sinon from "sinon"
import * as td from "testdouble"

import type { PluginContext } from "../../../../../src/plugin-context.js"
import type { ContainerProvider } from "../../../../../src/plugins/container/container.js"
import { gardenPlugin as gardenContainerPlugin } from "../../../../../src/plugins/container/container.js"
import { gardenPlugin as gardenK8sPlugin } from "../../../../../src/plugins/kubernetes/kubernetes.js"
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
import type { KubernetesProvider } from "../../../../../src/plugins/kubernetes/config.js"
import { kubernetesContainerHelpers } from "../../../../../src/plugins/kubernetes/container/build/local.js"
import { uuidv4 } from "../../../../../src/util/random.js"

describe("plugins.container", () => {
  const projectRoot = getDataDir("test-project-container-kubernetes")

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dockerCli: sinon.SinonStub<any>

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenContainerPlugin(), gardenK8sPlugin()] })
    log = createActionLog({ log: garden.log, action: { name: "", kind: "Build", uid: uuidv4() } })
    containerProvider = await garden.resolveProvider({ log: garden.log, name: "container" })
    ctx = await garden.getPluginContext({ provider: containerProvider, templateContext: undefined, events: undefined })
    td.replace(garden.buildStaging, "syncDependencyProducts", () => null)
  })

  afterEach(() => {
    sinon.restore()
    garden && garden.close()
  })

  async function getTestBuild(cfg: BuildActionConfig): Promise<Executed<ContainerBuildAction>> {
    sinon.replace(containerHelpers, "actionHasDockerfile", async () => true)
    sinon.replace(kubernetesContainerHelpers, "loadToLocalK8s", async () => undefined)

    dockerCli = sinon.stub(containerHelpers, "dockerCli")
    dockerCli.returns(
      Promise.resolve({
        all: "test log",
        stdout: "test log",
        stderr: "",
        code: 0,
        proc: null,
      })
    )

    garden.setPartialActionConfigs([cfg])
    const graph = await garden.getConfigGraph({ emit: false, log })
    const build = graph.getBuild(cfg.name)
    const resolved = await garden.resolveAction({ action: build, graph, log })
    const executed = await garden.executeAction({ action: resolved, graph, log })

    return executed
  }

  describe("publishContainerBuild", () => {
    it("should tag image if remote id differs from local id", async () => {
      const publishId = "some/image:1.1"

      const config = cloneDeep(baseConfig)

      config.spec.publishId = publishId

      const action = await getTestBuild(config)

      sinon.restore()

      const _dockerCli = sinon.stub(containerHelpers, "dockerCli")

      const result = await publishContainerBuild({ ctx, log, action })
      expect(result.detail).to.eql({ message: "Published some/image:1.1", published: true })

      sinon.assert.calledWithMatch(_dockerCli.firstCall, {
        cwd: action.getBuildPath(),
        args: ["tag", `test:${action.versionString(log)}`, publishId],
      })

      sinon.assert.calledWithMatch(_dockerCli.secondCall, {
        cwd: action.getBuildPath(),
        args: ["push", publishId],
      })
    })

    it("should use specified tag if provided", async () => {
      const config = cloneDeep(baseConfig)
      const action = await getTestBuild(config)

      sinon.restore()
      const _dockerCli = sinon.stub(containerHelpers, "dockerCli")

      const result = await publishContainerBuild({ ctx, log, action, tagOverride: "custom-tag" })
      expect(result.detail).to.eql({ message: "Published test:custom-tag", published: true })

      sinon.assert.calledWith(
        _dockerCli,
        sinon.match({
          cwd: action.getBuildPath(),
          args: ["tag", `test:${action.versionString(log)}`, "test:custom-tag"],
        })
      )

      sinon.assert.calledWith(
        _dockerCli,
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
        config.spec.publishId = "some/image:12345"

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId("some/image:12345", result.detail)
      })

      it("should fall back to spec.localId if spec.publishId is not defined", async () => {
        const config = cloneDeep(baseConfig)
        config.spec.localId = "private-registry/foobar"

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId(`private-registry/foobar:${action.versionString(log)}`, result.detail)
      })

      it("should fall back to action name if spec.localId and spec.publishId are not defined", async () => {
        const config = cloneDeep(baseConfig)

        action = await getTestBuild(config)
        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId(`test:${action.versionString(log)}`, result.detail)
      })
      it("should fall back to action.outputs.deploymentImageName if spec.localId and spec.publishId are not defined - with kubernetes provider with deployment registry", async () => {
        const kubernetesProvider = (await garden.resolveProvider({
          log,
          name: "local-kubernetes",
        })) as KubernetesProvider
        kubernetesProvider.config.deploymentRegistry = {
          hostname: "foo.io",
          namespace: "bar",
          insecure: false,
        }
        ctx = await garden.getPluginContext({
          provider: kubernetesProvider,
          templateContext: undefined,
          events: undefined,
        })
        const config = cloneDeep(baseConfig)

        action = await getTestBuild(config)

        const result = await publishContainerBuild({ ctx, log, action })
        assertPublishId(`foo.io/bar/test:${action.versionString(log)}`, result.detail)
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

      const args = getDockerBuildFlags(resolvedBuild, ctx.provider.config, log)

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

      const args = getDockerBuildFlags(resolvedBuild, ctx.provider.config, log)

      // Also module version is set for backwards compatability
      expect(args.slice(0, 2)).to.eql(["--build-arg", `GARDEN_MODULE_VERSION=${buildAction.versionString(log)}`])
      expect(args.slice(2, 4)).to.eql(["--build-arg", `GARDEN_ACTION_VERSION=${buildAction.versionString(log)}`])
    })
  })

  describe("multiPlatformBuilds", () => {
    it("should include platform flags", async () => {
      const config = cloneDeep(baseConfig)
      config.spec.platforms = ["linux/amd64", "linux/arm64"]

      const buildAction = await getTestBuild(config)
      const resolvedBuild = await garden.resolveAction({
        action: buildAction,
        log,
        graph: await garden.getConfigGraph({ log, emit: false }),
      })

      const args = getDockerBuildFlags(resolvedBuild, ctx.provider.config, log)
      expect(args.slice(-4)).to.eql(["--platform", "linux/amd64", "--platform", "linux/arm64"])
    })
  })
})
