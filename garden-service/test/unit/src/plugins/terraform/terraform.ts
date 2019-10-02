/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { expect } from "chai"
import { readFile, pathExists, remove } from "fs-extra"

import { getDataDir, makeTestGarden } from "../../../../helpers"
import { findByName } from "../../../../../src/util/util"
import { Garden } from "../../../../../src/garden"
import { Provider } from "../../../../../src/config/provider"
import { TaskTask } from "../../../../../src/tasks/task"

describe("Terraform provider", () => {
  const testRoot = getDataDir("test-projects", "terraform-provider")
  const testFilePath = join(testRoot, "tf", "test.log")

  let garden: Garden
  let providers: Provider[]

  before(async () => {
    garden = await makeTestGarden(testRoot)
    providers = await garden.resolveProviders()
  })

  after(async () => {
    if (await pathExists(testFilePath)) {
      await remove(testFilePath)
    }
  })

  it("should apply a stack on init and use configured variables", async () => {
    const testFileContent = await readFile(testFilePath)
    expect(testFileContent.toString()).to.equal("foo")
  })

  it("should expose outputs to template contexts", async () => {
    const testProvider = findByName(providers, "terraform")!
    expect(testProvider.status.outputs).to.eql({
      "my-output": "input: foo",
      "test-file-path": "./test.log",
    })
  })
})

describe("Terraform module type", () => {
  const testRoot = getDataDir("test-projects", "terraform-module")
  const testFilePath = join(testRoot, "tf", "test.log")

  let garden: Garden

  before(async () => {
    garden = await makeTestGarden(testRoot)
  })

  after(async () => {
    if (await pathExists(testFilePath)) {
      await remove(testFilePath)
    }
  })

  async function runTestTask() {
    const graph = await garden.getConfigGraph()
    const task = await graph.getTask("test-task")

    const taskTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: false,
      forceBuild: false,
      version: task.module.version,
    })

    return garden.processTasks([taskTask])
  }

  it("should apply a stack on init and use configured variables", async () => {
    await runTestTask()
    const testFileContent = await readFile(testFilePath)
    expect(testFileContent.toString()).to.equal("foo")
  })

  it("should expose runtime outputs to template contexts", async () => {
    const result = await runTestTask()
    expect(result["task.test-task"]!.output.outputs.log).to.equal("input: foo")
  })
})
