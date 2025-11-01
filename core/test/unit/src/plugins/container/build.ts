/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import sinon from "sinon"
import type { ResolvedBuildAction } from "../../../../../src/actions/build.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"
import type { ActionLog, Log } from "../../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../../src/logger/log-entry.js"
import type { PluginContext } from "../../../../../src/plugin-context.js"
import {
  buildContainer,
  getContainerBuildStatus,
  getDockerSecrets,
} from "../../../../../src/plugins/container/build.js"
import type { ContainerProvider } from "../../../../../src/plugins/container/container.js"
import { gardenPlugin } from "../../../../../src/plugins/container/container.js"
import { containerHelpers } from "../../../../../src/plugins/container/helpers.js"
import { joinWithPosix } from "../../../../../src/util/fs.js"
import type { TestGarden } from "../../../../helpers.js"
import { getDataDir, makeTestGarden } from "../../../../helpers.js"
import fsExtra from "fs-extra"

const { createFile } = fsExtra
import { type ContainerBuildActionSpec } from "../../../../../src/plugins/container/config.js"
import { makeSecret, toClearText } from "../../../../../src/util/secrets.js"
import { uuidv4 } from "../../../../../src/util/random.js"

context("build.ts", () => {
  const projectRoot = getDataDir("test-project-container")
  let garden: TestGarden
  let ctx: PluginContext
  let log: Log
  let actionLog: ActionLog
  let containerProvider: ContainerProvider
  let graph: ConfigGraph

  before(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = garden.log
    actionLog = createActionLog({ log, action: { name: "", kind: "Build", uid: uuidv4() } })
    containerProvider = await garden.resolveProvider({ log: garden.log, name: "container" })
    ctx = await garden.getPluginContext({ provider: containerProvider, templateContext: undefined, events: undefined })
    graph = await garden.getConfigGraph({ log, emit: false })
  })

  after(() => {
    garden.close()
  })

  const getAction = async () => await garden.resolveAction({ action: graph.getBuild("module-a"), log, graph })

  describe("getContainerBuildStatus", () => {
    it("should return ready if build exists locally", async () => {
      const action = await getAction()
      sinon.replace(containerHelpers, "getLocalImageInfo", async () => {
        return { identifier: "fake image identifier string", imageIds: [] }
      })

      const result = await getContainerBuildStatus({ ctx, log: actionLog, action })
      expect(result.state).to.eql("ready")
    })

    it("should return not-ready if build does not exist locally", async () => {
      const action = await getAction()
      sinon.replace(containerHelpers, "getLocalImageInfo", async () => undefined)

      const result = await getContainerBuildStatus({ ctx, log: actionLog, action })
      expect(result.state).to.eql("not-ready")
    })
  })

  describe("getDockerSecrets", () => {
    const baseSpec: ContainerBuildActionSpec = {
      buildArgs: {},
      extraFlags: [],
      dockerfile: "Dockerfile",
      secrets: undefined,
    }

    it("returns empty list of args when no secrets are declared", () => {
      const { secretArgs, secretEnvVars } = getDockerSecrets(baseSpec)
      expect(secretArgs).to.eql([])
      expect(secretEnvVars).to.eql({})
    })

    it("returns correct args and env vars when secrets have been declared", () => {
      const { secretArgs, secretEnvVars } = getDockerSecrets({
        ...baseSpec,
        secrets: {
          "api-key.fruit-ninja.company.com": makeSecret("banana"),
        },
      })
      expect(secretArgs).to.eql([
        "--secret",
        "id=api-key.fruit-ninja.company.com,env=GARDEN_BUILD_SECRET_API_KEY_FRUIT_NINJA_COMPANY_COM",
      ])
      expect(toClearText(secretEnvVars)).to.eql({
        GARDEN_BUILD_SECRET_API_KEY_FRUIT_NINJA_COMPANY_COM: "banana",
      })
    })

    it("handles ambiguous env var names", () => {
      const { secretArgs, secretEnvVars } = getDockerSecrets({
        ...baseSpec,
        secrets: {
          "api-key": makeSecret("banana"),
          "api_key": makeSecret("apple"),
        },
      })
      expect(secretArgs).to.eql([
        "--secret",
        "id=api-key,env=GARDEN_BUILD_SECRET_API_KEY",
        "--secret",
        "id=api_key,env=GARDEN_BUILD_SECRET_API_KEY_2",
      ])
      expect(toClearText(secretEnvVars)).to.eql({
        GARDEN_BUILD_SECRET_API_KEY: "banana",
        GARDEN_BUILD_SECRET_API_KEY_2: "apple",
      })
    })

    it("validates secret key names", () => {
      expect(() =>
        getDockerSecrets({
          ...baseSpec,
          secrets: {
            "not allowed": makeSecret("banana"),
            "not-safe$(exec ls /)": makeSecret("apple"),
          },
        })
      ).throws(
        "Invalid secret ID 'not allowed'. Only alphanumeric characters (a-z, A-Z, 0-9), underscores (_), dashes (-) and dots (.) are allowed."
      )
    })
  })

  describe("buildContainer", () => {
    beforeEach(() => {
      sinon.replace(containerHelpers, "checkDockerServerVersion", () => null)
    })

    function getCmdArgs(action: ResolvedBuildAction, buildPath: string) {
      return [
        "buildx",
        "build",
        "--build-arg",
        `GARDEN_MODULE_VERSION=${action.versionString(log)}`,
        "--build-arg",
        `GARDEN_ACTION_VERSION=${action.versionString(log)}`,
        "--progress",
        "rawjson",
        "--metadata-file",
        "/tmp/a-unique-path/metadata.json",
        "--tag",
        "some/image",
        "--file",
        joinWithPosix(action.getBuildPath(), action.getSpec().dockerfile),
        buildPath,
      ]
    }

    it("should build image if module contains Dockerfile", async () => {
      const action = await getAction()

      sinon.replace(action, "getOutputs", () => ({ localImageId: "some/image" }))

      const buildPath = action.getBuildPath()
      await createFile(join(buildPath, "Dockerfile"))

      const cmdArgs = getCmdArgs(action, buildPath)
      sinon.replace(containerHelpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(buildPath)
        // metadata.json is always at a unique path - we need to replace the filename for the assertion
        const idx = args.indexOf("--metadata-file") + 1
        args[idx] = "/tmp/a-unique-path/metadata.json"
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log", stdout: "", stderr: "", code: 0, proc: null }
      })
      const result = await buildContainer({ ctx, log: actionLog, action })
      expect(result.state).to.eql("ready")
      expect(result.detail?.buildLog).to.eql("log")
      expect(result.detail?.fresh).to.eql(true)
      expect(result.outputs.localImageId).to.eql("some/image")
    })

    it("should build image using the user specified Dockerfile path", async () => {
      const action = await getAction()

      action["_config"].spec.dockerfile = "docker-dir/Dockerfile"
      action.treeVersion().files.push(join(action.sourcePath(), "docker-dir", "Dockerfile"))

      sinon.replace(action, "getOutputs", () => ({ localImageId: "some/image" }))

      const buildPath = action.getBuildPath()
      await createFile(join(buildPath, "docker-dir/Dockerfile"))

      const cmdArgs = getCmdArgs(action, buildPath)
      sinon.replace(containerHelpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
        expect(cwd).to.equal(buildPath)
        // metadata.json is always at a unique path - we need to replace the filename for the assertion
        const idx = args.indexOf("--metadata-file") + 1
        args[idx] = "/tmp/a-unique-path/metadata.json"
        expect(args).to.eql(cmdArgs)
        expect(_ctx).to.exist
        return { all: "log", stdout: "", stderr: "", code: 0, proc: null }
      })
      const result = await buildContainer({ ctx, log: actionLog, action })
      expect(result.state).to.eql("ready")
      expect(result.detail?.buildLog).to.eql("log")
      expect(result.detail?.fresh).to.eql(true)
      expect(result.outputs.localImageId).to.eql("some/image")
    })
  })
})
