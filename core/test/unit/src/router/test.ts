/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { emptyDir, pathExists, readFile } from "fs-extra"
import { join } from "path"
import { TestActionConfig, TestAction } from "../../../../src/actions/test"
import { actionFromConfig } from "../../../../src/graph/actions"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { ActionLogContext, Log } from "../../../../src/logger/log-entry"
import { ActionRouter } from "../../../../src/router/router"
import { GardenModule } from "../../../../src/types/module"
import { TestGarden } from "../../../helpers"
import { getRouterTestData } from "./_helpers"

describe("test actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: Log<ActionLogContext>
  let actionRouter: ActionRouter
  let module: GardenModule

  async function getResolvedAction(testConfig: TestActionConfig<string, any>) {
    const action = (await actionFromConfig({
      garden,
      // rebuild config graph because the module config has been changed
      graph: await garden.getConfigGraph({ emit: false, log: garden.log }),
      config: testConfig,
      log: garden.log,
      configsByKey: {},
      router: await garden.getActionRouter(),
      mode: "default",
    })) as TestAction
    return await garden.resolveAction<TestAction>({ action, log: garden.log })
  }

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    module = data.module
  })

  after(async () => {
    await garden.close()
  })

  describe("test.run", () => {
    const actionConfig: TestActionConfig = {
      name: "test",
      type: "test",
      internal: { basePath: "test" },
      kind: "Test",
      dependencies: [],
      disabled: false,
      timeout: 1234,
      spec: {},
    }

    it("should correctly call the corresponding plugin handler", async () => {
      const action = await getResolvedAction(actionConfig)
      const { result } = await actionRouter.test.run({
        log,
        action,
        interactive: true,
        graph,
        silent: false,
      })
      expect(result.outputs).to.eql({
        base: "ok",
        foo: "ok",
      })
      expect(result.detail?.log).to.eql("bla bla")
      expect(result.state).to.eql("ready")
    })

    it("should emit testStatus events", async () => {
      const action = await getResolvedAction(actionConfig)
      garden.events.eventLog = []
      await actionRouter.test.run({
        log,
        action,
        interactive: true,
        graph,
        silent: false,
      })
      const testVersion = action.versionString()
      const event1 = garden.events.eventLog[0]
      const event2 = garden.events.eventLog[1]

      expect(event1).to.exist
      expect(event2).to.exist

      expect(event1.name).to.eql("testStatus")
      expect(event1.payload.actionName).to.eql("test")
      expect(event1.payload.actionUid).to.be.ok
      expect(event1.payload.state).to.eql("processing")
      expect(event1.payload.status.state).to.eql("running")

      expect(event2.name).to.eql("testStatus")
      expect(event2.payload.actionName).to.eql("test")
      expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
      expect(event2.payload.state).to.eql("ready")
      expect(event2.payload.status.state).to.eql("succeeded")
    })

    it("should copy artifacts exported by the handler to the artifacts directory", async () => {
      await emptyDir(garden.artifactsPath)

      const testConfig = {
        ...actionConfig,
        spec: {
          artifacts: [
            {
              source: "some-file.txt",
            },
            {
              source: "some-dir/some-file.txt",
              target: "some-dir/some-file.txt",
            },
          ],
        },
      }

      const action = await getResolvedAction(testConfig)

      await actionRouter.test.run({
        log,
        action,
        interactive: true,
        graph,
        silent: false,
      })

      const targetPaths = testConfig.spec.artifacts.map((spec) => join(garden.artifactsPath, spec.source)).sort()

      for (const path of targetPaths) {
        expect(await pathExists(path)).to.be.true
      }

      const metadataKey = `test.test.${action.versionString()}`
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

  describe("test.getResult", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const action = await garden.resolveAction({ action: graph.getTest("module-a-unit"), log, graph })

      const { result } = await actionRouter.test.getResult({
        log,
        action,
        graph,
      })

      expect(result.outputs).to.eql({
        base: "ok",
        foo: "ok",
      })
      expect(result.detail?.log).to.eql("bla bla")
      expect(result.state).to.eql("ready")
    })
  })

  it("should emit testStatus events", async () => {
    const action = await garden.resolveAction({ action: graph.getTest("module-a-unit"), log, graph })
    garden.events.eventLog = []

    await actionRouter.test.getResult({
      log,
      action,
      graph,
    })
    const event1 = garden.events.eventLog[0]
    const event2 = garden.events.eventLog[1]

    expect(event1).to.exist
    expect(event2).to.exist

    expect(event1.name).to.eql("testStatus")
    expect(event1.payload.moduleName).to.eql("module-a")
    expect(event1.payload.actionUid).to.be.ok
    expect(event1.payload.state).to.eql("getting-status")
    expect(event1.payload.status.state).to.eql("unknown")

    expect(event2.name).to.eql("testStatus")
    expect(event1.payload.moduleName).to.eql("module-a")
    expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
    expect(event2.payload.state).to.eql("cached")
    expect(event2.payload.status.state).to.eql("succeeded")
  })
})
