/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { expect } from "chai"
import { readFile, pathExists, remove } from "fs-extra"

import { getDataDir, makeTestGarden, getLogMessages } from "../../../../helpers"
import { findByName } from "../../../../../src/util/util"
import { Garden } from "../../../../../src/garden"
import { TaskTask } from "../../../../../src/tasks/task"
import { terraformCommands } from "../../../../../src/plugins/terraform/commands"
import { LogLevel } from "../../../../../src/logger/log-node"
import { ConfigGraph } from "../../../../../src/config-graph"
import { TerraformProvider } from "../../../../../src/plugins/terraform/terraform"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { emptyRuntimeContext } from "../../../../../src/runtime-context"

describe("Terraform provider", () => {
  const testRoot = getDataDir("test-projects", "terraform-provider")
  const tfRoot = join(testRoot, "tf")
  const stateDirPath = join(tfRoot, "terraform.tfstate")
  const testFilePath = join(tfRoot, "test.log")

  let garden: Garden

  async function reset() {
    if (await pathExists(testFilePath)) {
      await remove(testFilePath)
    }
    if (await pathExists(stateDirPath)) {
      await remove(stateDirPath)
    }
  }

  context("autoApply=false", () => {
    beforeEach(async () => {
      await reset()
      garden = await makeTestGarden(testRoot, { environmentName: "prod", forceRefresh: true })
    })

    after(async () => {
      await reset()
    })

    it("should warn if stack is not up-to-date", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      const messages = getLogMessages(garden.log, (e) => e.level === LogLevel.warn)
      expect(messages).to.include(
        "Terraform stack is not up-to-date and autoApply is not enabled. Please run garden plugins terraform apply-root to make sure the stack is in the intended state."
      )
      expect(provider.status.disableCache).to.be.true
    })

    it("should expose outputs to template contexts after applying", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      const ctx = garden.getPluginContext(provider)
      const applyRootCommand = findByName(terraformCommands, "apply-root")!
      await applyRootCommand.handler({
        ctx,
        args: ["-auto-approve", "-input=false"],
        log: garden.log,
        modules: [],
      })

      const _garden = await makeTestGarden(testRoot, { environmentName: "prod" })
      const _provider = await _garden.resolveProvider(_garden.log, "terraform")

      expect(_provider.status.outputs).to.eql({
        "my-output": "input: foo",
        "test-file-path": "./test.log",
      })
    })

    describe("apply-root command", () => {
      it("call terraform apply for the project root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = garden.getPluginContext(provider)

        const command = findByName(terraformCommands, "apply-root")!
        await command.handler({
          ctx,
          args: ["-auto-approve", "-input=false"],
          log: garden.log,
          modules: [],
        })
      })
    })

    describe("plan-root command", () => {
      it("call terraform plan for the project root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = garden.getPluginContext(provider)

        const command = findByName(terraformCommands, "plan-root")!
        await command.handler({
          ctx,
          args: ["-input=false"],
          log: garden.log,
          modules: [],
        })
      })
    })
  })

  context("autoApply=true", () => {
    before(async () => {
      await reset()
      garden = await makeTestGarden(testRoot, { environmentName: "local", forceRefresh: true })
    })

    after(async () => {
      await reset()
    })

    it("should apply a stack on init and use configured variables", async () => {
      await garden.resolveProvider(garden.log, "terraform")
      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("foo")
    })

    it("should expose outputs to template contexts", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      expect(provider.status.outputs).to.eql({
        "my-output": "input: foo",
        "test-file-path": "./test.log",
      })
    })
  })
})

describe("Terraform module type", () => {
  const testRoot = getDataDir("test-projects", "terraform-module")
  const tfRoot = join(testRoot, "tf")
  const stateDirPath = join(tfRoot, "terraform.tfstate")
  const testFilePath = join(tfRoot, "test.log")

  let garden: Garden
  let graph: ConfigGraph

  async function reset() {
    if (await pathExists(testFilePath)) {
      await remove(testFilePath)
    }
    if (await pathExists(stateDirPath)) {
      await remove(stateDirPath)
    }
  }

  beforeEach(async () => {
    await reset()
    garden = await makeTestGarden(testRoot)
  })

  after(async () => {
    await reset()
  })

  async function deployStack(autoApply: boolean) {
    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["tf"].spec.autoApply = autoApply

    graph = await garden.getConfigGraph(garden.log)
    const service = graph.getService("tf")

    const deployTask = new DeployTask({
      garden,
      graph,
      service,
      log: garden.log,
      force: false,
      forceBuild: false,
    })

    return garden.processTasks([deployTask], { throwOnError: true })
  }

  async function runTestTask(autoApply: boolean) {
    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["tf"].spec.autoApply = autoApply

    graph = await garden.getConfigGraph(garden.log)
    const task = graph.getTask("test-task")

    const taskTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: false,
      forceBuild: false,
      version: task.module.version,
    })

    return garden.processTasks([taskTask], { throwOnError: true })
  }

  describe("apply-module command", () => {
    it("call terraform apply for the module root", async () => {
      const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = garden.getPluginContext(provider)
      graph = await garden.getConfigGraph(garden.log)

      const command = findByName(terraformCommands, "apply-module")!
      await command.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })
    })
  })

  describe("plan-module command", () => {
    it("call terraform apply for the module root", async () => {
      const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = garden.getPluginContext(provider)
      graph = await garden.getConfigGraph(garden.log)

      const command = findByName(terraformCommands, "plan-module")!
      await command.handler({
        ctx,
        args: ["tf", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })
    })
  })

  context("autoApply=false", () => {
    it("should warn if the stack is out of date", async () => {
      await deployStack(false)
      const messages = getLogMessages(garden.log, (e) => e.level === LogLevel.warn)
      expect(messages).to.include(
        "Stack is out-of-date but autoApply is set to false, so it will not be applied automatically. If any newly added stack outputs are referenced via ${runtime.services.tf.outputs.*} template strings and are missing, you may see errors when resolving them."
      )
    })

    it("should expose runtime outputs to template contexts if stack had already been applied", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      const ctx = garden.getPluginContext(provider)
      const applyCommand = findByName(terraformCommands, "apply-module")!
      await applyCommand.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })

      const result = await runTestTask(false)

      expect(result["task.test-task"]!.output.log).to.equal("input: foo")
      expect(result["task.test-task"]!.output.outputs.log).to.equal("input: foo")
    })

    it("should should return outputs with the service status", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      const ctx = garden.getPluginContext(provider)
      const applyCommand = findByName(terraformCommands, "apply-module")!
      await applyCommand.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })

      const actions = await garden.getActionRouter()
      const status = await actions.getServiceStatus({
        service: graph.getService("tf"),
        hotReload: false,
        log: garden.log,
        runtimeContext: emptyRuntimeContext,
      })

      expect(status.outputs).to.eql({
        "map-output": {
          first: "second",
        },
        "my-output": "input: foo",
        "test-file-path": "./test.log",
      })
    })
  })

  context("autoApply=true", () => {
    it("should apply a stack on init and use configured variables", async () => {
      await runTestTask(true)
      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("foo")
    })

    it("should expose runtime outputs to template contexts", async () => {
      const result = await runTestTask(true)

      expect(result["task.test-task"]!.output.log).to.equal("input: foo")
      expect(result["task.test-task"]!.output.outputs.log).to.equal("input: foo")
    })
  })
})
