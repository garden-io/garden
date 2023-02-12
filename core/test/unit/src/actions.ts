/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { writeFile } from "fs"
import { join } from "path"
import { actionConfigsToGraph } from "../../../src/graph/actions"
import { ModuleGraph } from "../../../src/graph/modules"
import { LogEntry } from "../../../src/logger/log-entry"
import { dumpYaml } from "../../../src/util/util"
import { expectError, makeTempGarden, TempDirectory, TestGarden } from "../../helpers"

describe("actionConfigsToGraph", () => {
  let tmpDir: TempDirectory
  let garden: TestGarden
  let log: LogEntry

  before(async () => {
    const result = await makeTempGarden()
    tmpDir = result.tmpDir
    garden = result.garden
    log = garden.log
  })

  it("resolves a Build action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Build")
    expect(action.name).to.equal("foo")
    expect(action.basePath()).to.equal(tmpDir.path)
  })

  it("resolves a Deploy action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Deploy")
    expect(action.name).to.equal("foo")
    expect(action.basePath()).to.equal(tmpDir.path)
  })

  it("resolves a Run action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Run",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Run")
    expect(action.name).to.equal("foo")
    expect(action.basePath()).to.equal(tmpDir.path)
  })

  it("resolves a Test action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Test",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Test")
    expect(action.name).to.equal("foo")
    expect(action.basePath()).to.equal(tmpDir.path)
  })

  it("resolves actions in groups", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [
        {
          kind: "Group",
          name: "foo",
          path: tmpDir.path,
          actions: [
            {
              kind: "Test",
              type: "test",
              name: "foo",
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
          ],
        },
      ],
      configs: [],
      moduleGraph: new ModuleGraph([], {}),
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Test")
    expect(action.name).to.equal("foo")
    expect(action.basePath()).to.equal(tmpDir.path)
  })

  it("adds dependencies from copyFrom on Build actions", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "bar",
          copyFrom: [{ build: "foo", sourcePath: ".", targetPath: "app" }],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: true,
        kind: "Build",
        name: "foo",
        needsExecutedOutputs: false,
        needsStaticOutputs: false,
      },
    ])
  })

  it("adds build reference on runtime actions as dependency", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "bar",
          build: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getDeploy("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: true,
        kind: "Build",
        name: "foo",
        needsExecutedOutputs: false,
        needsStaticOutputs: false,
      },
    ])
  })

  it("adds implicit dependencies from template references in config", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "bar",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {
            command: ["echo", "${action.build.foo.version}"],
          },
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: false,
        kind: "Build",
        name: "foo",
        fullRef: ["action", "build", "foo", "version"],
        needsExecutedOutputs: false,
        needsStaticOutputs: true,
      },
    ])
  })

  it("flags implicit dependency as needing execution if a non-static output is referenced", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "bar",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {
            command: ["echo", "${action.build.foo.outputs.bar}"],
          },
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: false,
        kind: "Build",
        name: "foo",
        fullRef: ["action", "build", "foo", "outputs", "bar"],
        needsExecutedOutputs: true,
        needsStaticOutputs: false,
      },
    ])
  })

  it("correctly sets compatibleTypes for an action type with no base", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("foo")

    expect(action.isCompatible("test")).to.be.true
  })

  it.skip("correctly sets compatibleTypes for an action type with a base", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("bar")

    expect(action.isCompatible("base")).to.be.true
  })

  it("sets variables for the action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          variables: {
            projectName: "${project.name}",
          },
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("foo")
    const vars = action["variables"]

    expect(vars).to.eql({ projectName: garden.projectName })
  })

  it("loads varfiles for the action", async () => {
    const varfilePath = join(tmpDir.path, "varfile.yml")
    await dumpYaml(varfilePath, {
      projectName: "${project.name}",
    })

    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          varfiles: [varfilePath],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("foo")
    const vars = action["variables"]

    expect(vars).to.eql({ projectName: "${project.name}" })
  })

  it("correctly merges varfile with variables", async () => {
    const varfilePath = join(tmpDir.path, "varfile.yml")
    await dumpYaml(varfilePath, {
      foo: "FOO",
      bar: "BAR",
    })

    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          variables: {
            foo: "foo",
            baz: "baz",
          },
          varfiles: [varfilePath],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph([], {}),
    })

    const action = graph.getBuild("foo")
    const vars = action["variables"]

    expect(vars).to.eql({ foo: "FOO", bar: "BAR", baz: "baz" })
  })

  it("throws if an unknown action kind is given", async () => {
    await expectError(
      () =>
        actionConfigsToGraph({
          garden,
          log,
          groupConfigs: [],
          configs: [
            {
              kind: <any>"Boop",
              type: "test",
              name: "foo",
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
          ],
          moduleGraph: new ModuleGraph([], {}),
        }),
      (err) => expect(err.message).to.equal("Unknown action kind: Boop")
    )
  })

  it("throws if two actions with same key are given", async () => {
    await expectError(
      () =>
        actionConfigsToGraph({
          garden,
          log,
          groupConfigs: [],
          configs: [
            {
              kind: "Build",
              type: "test",
              name: "foo",
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
            {
              kind: "Build",
              type: "test",
              name: "foo",
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
          ],
          moduleGraph: new ModuleGraph([], {}),
        }),
      {
        contains: ["Found two actions of the same name and kind:"],
      }
    )
  })
})
