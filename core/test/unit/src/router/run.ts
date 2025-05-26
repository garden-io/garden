/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import fsExtra from "fs-extra"
const { emptyDir, pathExists, readFile } = fsExtra
import { join } from "path"
import type { ResolvedRunAction } from "../../../../src/actions/run.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { ActionLog } from "../../../../src/logger/log-entry.js"
import type { ActionRouter } from "../../../../src/router/router.js"
import type { TestGarden } from "../../../helpers.js"
import { expectError } from "../../../helpers.js"
import { getRouterTestData } from "./_helpers.js"

describe("run actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: ActionLog
  let actionRouter: ActionRouter
  let returnWrongOutputsCfgKey: string
  let resolvedRunAction: ResolvedRunAction
  let taskResult = {}
  let dateUsedForCompleted: Date

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    resolvedRunAction = data.resolvedRunAction
    returnWrongOutputsCfgKey = data.returnWrongOutputsCfgKey
    dateUsedForCompleted = data.dateUsedForCompleted
    taskResult = {
      detail: {
        command: ["foo"],
        completedAt: dateUsedForCompleted,
        log: "bla bla",
        moduleName: "task-a",
        startedAt: dateUsedForCompleted,
        success: true,
        taskName: "task-a",
        version: resolvedRunAction.versionString(),
      },
      outputs: {
        base: "ok",
        foo: "ok",
      },
      state: "ready",
    }
  })

  after(async () => {
    garden.close()
  })

  afterEach(() => {
    resolvedRunAction._config[returnWrongOutputsCfgKey] = false
  })

  describe("run.getResult", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.run.getResult({
        log,
        action: resolvedRunAction,
        graph,
      })
      expect(result).to.eql(taskResult)
    })

    it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
      resolvedRunAction._config[returnWrongOutputsCfgKey] = true
      await expectError(() => actionRouter.run.getResult({ log, action: resolvedRunAction, graph }), {
        contains: ["Error validating runtime action outputs from Run 'task-a'", "foo must be a string"],
      })
    })
  })

  describe("run.run", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.run.run({
        log,
        action: resolvedRunAction,
        interactive: true,
        graph,
      })
      expect(result).to.eql(taskResult)
    })

    it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
      resolvedRunAction._config[returnWrongOutputsCfgKey] = true
      await expectError(
        () =>
          actionRouter.run.run({
            log,
            action: resolvedRunAction,
            interactive: true,
            graph,
          }),
        { contains: ["Error validating runtime action outputs from Run 'task-a'", "foo must be a string"] }
      )
    })

    it("should copy artifacts exported by the handler to the artifacts directory", async () => {
      await emptyDir(garden.artifactsPath)

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runActionTaskA = graph.getRun("task-a")

      runActionTaskA["_config"].spec.artifacts = [
        {
          source: "some-file.txt",
        },
        {
          source: "some-dir/some-file.txt",
          target: "some-dir/some-file.txt",
        },
      ]

      await actionRouter.run.run({
        log,
        action: await garden.resolveAction({
          action: runActionTaskA,
          log: garden.log,
          graph,
        }),
        interactive: true,
        graph,
      })

      const targetPaths = runActionTaskA
        .getConfig()
        .spec.artifacts.map((spec) => join(garden.artifactsPath, spec.source))
        .sort()

      for (const path of targetPaths) {
        expect(await pathExists(path)).to.be.true
      }

      const metadataKey = `run.task-a.${runActionTaskA.versionString()}`
      const metadataFilename = `.metadata.${metadataKey}.json`
      const metadataPath = join(garden.artifactsPath, metadataFilename)
      expect(await pathExists(metadataPath)).to.be.true

      const metadata = JSON.parse((await readFile(metadataPath)).toString())
      expect(metadata).to.eql({
        key: metadataKey,
        files: targetPaths,
      })
    })
  })
})
