/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { emptyDir, pathExists, readFile } from "fs-extra"
import { join } from "path"
import stripAnsi from "strip-ansi"
import { ResolvedRunAction } from "../../../../src/actions/run"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ActionRouter } from "../../../../src/router/router"
import { TestGarden, expectError } from "../../../helpers"
import { getRouterTestData } from "./_helpers"

describe("run actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
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
    await garden.close()
  })

  describe("run.getResult", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const result = await actionRouter.run.getResult({
        log,
        action: resolvedRunAction,
        graph,
      })
      expect(result).to.eql(taskResult)
    })

    it("should emit a taskStatus event", async () => {
      garden.events.eventLog = []
      await actionRouter.run.getResult({
        log,
        action: resolvedRunAction,
        graph,
      })
      const event = garden.events.eventLog[0]
      expect(event).to.exist
      expect(event.name).to.eql("taskStatus")
      expect(event.payload.taskName).to.eql("task-a")
      expect(event.payload.moduleName).to.eql("module-a")
      expect(event.payload.moduleVersion).to.eql(resolvedRunAction.moduleVersion().versionString)
      expect(event.payload.taskVersion).to.eql(resolvedRunAction.versionString())
      expect(event.payload.actionUid).to.be.undefined
      expect(event.payload.status.state).to.eql("succeeded")
    })

    it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
      const action = await garden.resolveAction({ action: graph.getRun(resolvedRunAction.name), log, graph })
      action._config[returnWrongOutputsCfgKey] = true
      await expectError(
        () => actionRouter.run.getResult({ log, action, graph }),
        (err) =>
          expect(stripAnsi(err.message)).to.include(
            "Error validating outputs from Run 'task-a': key .foo must be a string"
          )
      )
    })
  })

  describe("run.run", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const result = await actionRouter.run.run({
        log,
        action: resolvedRunAction,
        interactive: true,
        graph,
      })
      expect(result).to.eql(taskResult)
    })

    it("should emit taskStatus events", async () => {
      garden.events.eventLog = []
      await actionRouter.run.run({
        log,
        action: resolvedRunAction,
        interactive: true,
        graph,
      })
      const moduleVersion = resolvedRunAction.moduleVersion().versionString
      const event1 = garden.events.eventLog[0]
      const event2 = garden.events.eventLog[1]
      expect(event1).to.exist
      expect(event1.name).to.eql("taskStatus")
      expect(event1.payload.taskName).to.eql("task-a")
      expect(event1.payload.moduleName).to.eql("module-a")
      expect(event1.payload.moduleVersion).to.eql(moduleVersion)
      expect(event1.payload.taskVersion).to.eql(resolvedRunAction.versionString())
      expect(event1.payload.actionUid).to.be.ok
      expect(event1.payload.status.state).to.eql("running")
      expect(event2).to.exist
      expect(event2.name).to.eql("taskStatus")
      expect(event2.payload.taskName).to.eql("task-a")
      expect(event2.payload.moduleName).to.eql("module-a")
      expect(event2.payload.moduleVersion).to.eql(moduleVersion)
      expect(event2.payload.taskVersion).to.eql(resolvedRunAction.versionString())
      expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
      expect(event2.payload.status.state).to.eql("succeeded")
    })

    it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
      const action = await garden.resolveAction({ action: graph.getRun(resolvedRunAction.name), log, graph })
      action._config[returnWrongOutputsCfgKey] = true
      await expectError(
        () =>
          actionRouter.run.run({
            log,
            action,
            interactive: true,
            graph,
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.include(
            "Error validating outputs from Run 'task-a': key .foo must be a string"
          )
      )
    })

    it("should copy artifacts exported by the handler to the artifacts directory", async () => {
      await emptyDir(garden.artifactsPath)

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runActionTaskA = graph.getRun("task-a")

      runActionTaskA.getConfig().spec.artifacts = [
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
