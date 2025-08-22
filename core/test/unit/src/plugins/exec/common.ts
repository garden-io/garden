/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import { execOutputsJsonFilename, execRunCommand, readExecOutputs } from "../../../../../src/plugins/exec/common.js"
import tmp from "tmp-promise"
import fsExtra from "fs-extra"
import { expect } from "chai"
import type { TestGarden } from "../../../../helpers.js"
import { expectError, getDataDir, makeTestGarden } from "../../../../helpers.js"
import type { PluginContext } from "../../../../../src/plugin-context.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import { dedent } from "../../../../../src/util/string.js"

const { mkdirp, writeFile } = fsExtra

describe("readExecOutputs", () => {
  let tmpDir: tmp.DirectoryResult

  const log = getRootLogger().createLog()

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("reads JSON outputs", async () => {
    const expected = { foo: "bar" }
    await writeFile(join(tmpDir.path, execOutputsJsonFilename), JSON.stringify(expected))

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql(expected)
  })

  it("reads outputs from files", async () => {
    const pathA = join(tmpDir.path, "foo")
    await writeFile(pathA, "bar")
    const pathB = join(tmpDir.path, "baz")
    await writeFile(pathB, "qux")

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({ foo: "bar", baz: "qux" })
  })

  it("ignores disallowed keys in file outputs", async () => {
    const pathA = join(tmpDir.path, "log")
    await writeFile(pathA, "bar")
    const pathB = join(tmpDir.path, "stdout")
    await writeFile(pathB, "qux")
    const pathC = join(tmpDir.path, "stderr")
    await writeFile(pathC, "qux")

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("ignores disallowed keys in JSON outputs", async () => {
    const jsonPath = join(tmpDir.path, execOutputsJsonFilename)
    await writeFile(jsonPath, JSON.stringify({ log: "bar", stdout: "qux", stderr: "qux" }))

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("ignores files starting with a dot", async () => {
    const pathA = join(tmpDir.path, ".foo")
    await writeFile(pathA, "bar")

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("ignores files that are not valid output keys", async () => {
    const pathA = join(tmpDir.path, "foo.bar")
    await writeFile(pathA, "bar")

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("ignores files that are not valid output keys in JSON outputs", async () => {
    const jsonPath = join(tmpDir.path, execOutputsJsonFilename)
    await writeFile(jsonPath, JSON.stringify({ "foo.bar": "baz" }))

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("ignores directories", async () => {
    const pathA = join(tmpDir.path, "foo")
    await mkdirp(pathA)

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("ignores non-primitive values in JSON outputs", async () => {
    const expected = { foo: { bar: "baz" } }
    await writeFile(join(tmpDir.path, execOutputsJsonFilename), JSON.stringify(expected))

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({})
  })

  it("overrides JSON outputs with file outputs", async () => {
    const expected = { foo: "bar" }
    await writeFile(join(tmpDir.path, execOutputsJsonFilename), JSON.stringify(expected))
    const pathA = join(tmpDir.path, "foo")
    await writeFile(pathA, "baz")

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql({ foo: "baz" })
  })

  it("throws if the outputs JSON file is not a valid JSON object/map", async () => {
    const jsonPath = join(tmpDir.path, execOutputsJsonFilename)
    await writeFile(jsonPath, "not a valid JSON object/map")

    await expectError(() => readExecOutputs(log, tmpDir.path), {
      contains: `Outputs JSON file ${jsonPath} is not a valid JSON object/map`,
    })
  })

  it("throws if the outputs JSON file contains an array", async () => {
    const jsonPath = join(tmpDir.path, execOutputsJsonFilename)
    await writeFile(jsonPath, JSON.stringify(["foo", "bar"]))

    await expectError(() => readExecOutputs(log, tmpDir.path), {
      contains: `Outputs JSON file ${jsonPath} is not a valid JSON object/map`,
    })
  })

  it("returns an empty object if the outputs directory does not exist", async () => {
    const outputs = await readExecOutputs(log, join(tmpDir.path, "does-not-exist"))

    expect(outputs).to.eql({})
  })

  it("allows non-string values in JSON outputs", async () => {
    const expected = { foo: 123, bar: true, baz: null }
    await writeFile(join(tmpDir.path, execOutputsJsonFilename), JSON.stringify(expected))

    const outputs = await readExecOutputs(log, tmpDir.path)

    expect(outputs).to.eql(expected)
  })
})

describe("execRunCommand", () => {
  let garden: TestGarden
  let log: Log
  let ctx: PluginContext

  before(async () => {
    garden = await makeTestGarden(getDataDir("test-project-exec"))
    const execProvider = await garden.resolveProvider({ log: garden.log, name: "exec" })
    ctx = await garden.getPluginContext({ provider: execProvider, templateContext: undefined, events: undefined })
    // graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })
    log = garden.log
    // router = await garden.getActionRouter()
  })

  after(async () => {
    garden?.close()
  })

  it("runs a command", async () => {
    const command = ["echo", "hello"]
    const action = await garden.addAndResolveAction(
      {
        kind: "Run",
        type: "exec",
        name: "test",
        spec: {
          command,
        },
      },
      true
    )

    const result = await execRunCommand({
      command,
      ctx,
      action,
      log,
    })

    expect(result.outputLog).to.equal("hello")
  })

  it("runs a command with a shell", async () => {
    const command = ["echo hello"]
    const action = await garden.addAndResolveAction(
      {
        kind: "Run",
        type: "exec",
        name: "test",
        spec: {
          command,
          shell: true,
        },
      },
      true
    )

    const result = await execRunCommand({
      command,
      ctx,
      action,
      log,
    })

    expect(result.outputLog).to.equal("hello")
  })

  it("gathers outputs from files", async () => {
    const command = [
      dedent`
        echo "hello" > $GARDEN_ACTION_OUTPUTS_PATH/foo
        echo "world" > $GARDEN_ACTION_OUTPUTS_PATH/bar
      `,
    ]
    const action = await garden.addAndResolveAction(
      {
        kind: "Run",
        type: "exec",
        name: "test",
        spec: {
          shell: true,
          command,
        },
      },
      true
    )

    const result = await execRunCommand({
      command,
      ctx,
      action,
      log,
    })

    expect(result.outputs).to.eql({ foo: "hello", bar: "world", log: "", stdout: "", stderr: "" })
  })

  it("gathers outputs from JSON file", async () => {
    const command = [
      dedent`
        echo '{"foo": "hello", "bar": "world"}' > $GARDEN_ACTION_JSON_OUTPUTS_PATH
      `,
    ]
    const action = await garden.addAndResolveAction(
      {
        kind: "Run",
        type: "exec",
        name: "test",
        spec: {
          shell: true,
          command,
        },
      },
      true
    )

    const result = await execRunCommand({
      command,
      ctx,
      action,
      log,
    })

    expect(result.outputs).to.eql({ foo: "hello", bar: "world", log: "", stdout: "", stderr: "" })
  })
})
