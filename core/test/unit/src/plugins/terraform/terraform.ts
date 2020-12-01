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
import { getTerraformCommands } from "../../../../../src/plugins/terraform/commands"
import { LogLevel } from "../../../../../src/logger/log-node"
import { ConfigGraph } from "../../../../../src/config-graph"
import { TerraformProvider } from "../../../../../src/plugins/terraform/terraform"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { emptyRuntimeContext } from "../../../../../src/runtime-context"
import { getWorkspaces, setWorkspace } from "../../../../../src/plugins/terraform/common"

describe("Terraform provider", () => {
  const testRoot = getDataDir("test-projects", "terraform-provider")
  const tfRoot = join(testRoot, "tf")
  const stateDirPath = join(tfRoot, "terraform.tfstate")
  const stateDirPathWithWorkspaces = join(tfRoot, "terraform.tfstate.d")
  const testFilePath = join(tfRoot, "test.log")

  let garden: Garden

  async function reset() {
    if (await pathExists(testFilePath)) {
      await remove(testFilePath)
    }
    if (await pathExists(stateDirPath)) {
      await remove(stateDirPath)
    }
    if (await pathExists(stateDirPathWithWorkspaces)) {
      await remove(stateDirPathWithWorkspaces)
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
      const ctx = await garden.getPluginContext(provider)
      const applyRootCommand = findByName(getTerraformCommands(), "apply-root")!
      await applyRootCommand.handler({
        ctx,
        args: ["-auto-approve", "-input=false"],
        log: garden.log,
        modules: [],
      })

      const _garden = await makeTestGarden(testRoot, { environmentName: "prod" })
      const _provider = await _garden.resolveProvider(_garden.log, "terraform")

      expect(_provider.status.outputs).to.eql({
        "my-output": "workspace: default, input: foo",
        "test-file-path": "./test.log",
      })
    })

    describe("apply-root command", () => {
      it("calls terraform apply for the project root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext(provider)

        const command = findByName(getTerraformCommands(), "apply-root")!
        await command.handler({
          ctx,
          args: ["-auto-approve", "-input=false"],
          log: garden.log,
          modules: [],
        })
      })

      it("sets the workspace before running the command", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        provider.config.workspace = "foo"

        const ctx = await garden.getPluginContext(provider)

        const command = findByName(getTerraformCommands(), "apply-root")!
        await command.handler({
          ctx,
          args: ["-auto-approve", "-input=false"],
          log: garden.log,
          modules: [],
        })

        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("foo")
      })
    })

    describe("plan-root command", () => {
      it("calls terraform plan for the project root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext(provider)

        const command = findByName(getTerraformCommands(), "plan-root")!
        await command.handler({
          ctx,
          args: ["-input=false"],
          log: garden.log,
          modules: [],
        })
      })

      it("sets the workspace before running the command", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        provider.config.workspace = "foo"

        const ctx = await garden.getPluginContext(provider)

        const command = findByName(getTerraformCommands(), "plan-root")!
        await command.handler({
          ctx,
          args: ["-input=false"],
          log: garden.log,
          modules: [],
        })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: garden.log })
        expect(selected).to.equal("foo")
      })
    })

    describe("destroy-root command", () => {
      it("calls terraform destroy for the project root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext(provider)

        const command = findByName(getTerraformCommands(), "destroy-root")!
        await command.handler({
          ctx,
          args: ["-input=false", "-auto-approve"],
          log: garden.log,
          modules: [],
        })
      })

      it("sets the workspace before running the command", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        provider.config.workspace = "foo"

        const ctx = await garden.getPluginContext(provider)

        const command = findByName(getTerraformCommands(), "destroy-root")!
        await command.handler({
          ctx,
          args: ["-input=false", "-auto-approve"],
          log: garden.log,
          modules: [],
        })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: garden.log })
        expect(selected).to.equal("foo")
      })
    })

    context("allowDestroy=false", () => {
      it("doesn't call terraform destroy when calling the delete service handler", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const ctx = await garden.getPluginContext(provider)

        // This creates the test file
        const command = findByName(getTerraformCommands(), "apply-root")!
        await command.handler({
          ctx,
          args: ["-auto-approve", "-input=false"],
          log: garden.log,
          modules: [],
        })

        const actions = await garden.getActionRouter()
        await actions.cleanupEnvironment({ log: garden.log, pluginName: "terraform" })

        // File should still exist
        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("default")
      })
    })
  })

  context("autoApply=true", () => {
    before(async () => {
      garden = await makeTestGarden(testRoot, { environmentName: "local", forceRefresh: true })
    })

    beforeEach(async () => {
      await reset()
    })

    after(async () => {
      await reset()
    })

    it("should apply a stack on init and use configured variables", async () => {
      await garden.resolveProvider(garden.log, "terraform")
      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("default")
    })

    it("sets the workspace before applying the stack", async () => {
      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })
      await _garden.resolveProvider(garden.log, "terraform")
      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("foo")
    })

    it("should expose outputs to template contexts", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      expect(provider.status.outputs).to.eql({
        "my-output": "workspace: default, input: foo",
        "test-file-path": "./test.log",
      })
    })

    context("allowDestroy=true", () => {
      it("calls terraform destroy when calling the delete service handler", async () => {
        // This implicitly creates the test file
        await garden.resolveProvider(garden.log, "terraform")

        // This should remove the file
        const actions = await garden.getActionRouter()
        await actions.cleanupEnvironment({ log: garden.log, pluginName: "terraform" })

        expect(await pathExists(testFilePath)).to.be.false
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

  async function runTestTask(autoApply: boolean, allowDestroy = false) {
    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["tf"].spec.allowDestroy = allowDestroy
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
    it("calls terraform apply for the module root", async () => {
      const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = await garden.getPluginContext(provider)
      graph = await garden.getConfigGraph(garden.log)

      const command = findByName(getTerraformCommands(), "apply-module")!
      await command.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })
    })

    it("sets the workspace before running the command", async () => {
      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })

      const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = await _garden.getPluginContext(provider)

      await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

      graph = await _garden.getConfigGraph(_garden.log)

      const command = findByName(getTerraformCommands(), "apply-module")!
      await command.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })

      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("foo")
    })
  })

  describe("plan-module command", () => {
    it("calls terraform apply for the module root", async () => {
      const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = await garden.getPluginContext(provider)
      graph = await garden.getConfigGraph(garden.log)

      const command = findByName(getTerraformCommands(), "plan-module")!
      await command.handler({
        ctx,
        args: ["tf", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })
    })

    it("sets the workspace before running the command", async () => {
      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })

      const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = await _garden.getPluginContext(provider)

      await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

      graph = await _garden.getConfigGraph(_garden.log)

      const command = findByName(getTerraformCommands(), "plan-module")!
      await command.handler({
        ctx,
        args: ["tf", "-input=false"],
        log: _garden.log,
        modules: graph.getModules(),
      })

      const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
      expect(selected).to.equal("foo")
    })
  })

  describe("destroy-module command", () => {
    it("calls terraform destroy for the module root", async () => {
      const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = await garden.getPluginContext(provider)
      graph = await garden.getConfigGraph(garden.log)

      const command = findByName(getTerraformCommands(), "destroy-module")!
      await command.handler({
        ctx,
        args: ["tf", "-input=false", "-auto-approve"],
        log: garden.log,
        modules: graph.getModules(),
      })
    })

    it("sets the workspace before running the command", async () => {
      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })

      const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
      const ctx = await _garden.getPluginContext(provider)

      await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

      graph = await _garden.getConfigGraph(_garden.log)

      const command = findByName(getTerraformCommands(), "destroy-module")!
      await command.handler({
        ctx,
        args: ["tf", "-input=false", "-auto-approve"],
        log: garden.log,
        modules: graph.getModules(),
      })

      const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
      expect(selected).to.equal("foo")
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
      const ctx = await garden.getPluginContext(provider)
      const applyCommand = findByName(getTerraformCommands(), "apply-module")!
      await applyCommand.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: garden.log,
        modules: graph.getModules(),
      })

      const result = await runTestTask(false)

      expect(result["task.test-task"]!.output.log).to.equal("workspace: default, input: foo")
      expect(result["task.test-task"]!.output.outputs.log).to.equal("workspace: default, input: foo")
    })

    it("should return outputs with the service status", async () => {
      const provider = await garden.resolveProvider(garden.log, "terraform")
      const ctx = await garden.getPluginContext(provider)
      const applyCommand = findByName(getTerraformCommands(), "apply-module")!
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
        "my-output": "workspace: default, input: foo",
        "test-file-path": "./test.log",
      })
    })

    it("sets the workspace before getting the status and returning outputs", async () => {
      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })

      const provider = await _garden.resolveProvider(_garden.log, "terraform")
      const ctx = await _garden.getPluginContext(provider)
      const applyCommand = findByName(getTerraformCommands(), "apply-module")!
      await applyCommand.handler({
        ctx,
        args: ["tf", "-auto-approve", "-input=false"],
        log: _garden.log,
        modules: graph.getModules(),
      })

      const actions = await _garden.getActionRouter()
      const status = await actions.getServiceStatus({
        service: graph.getService("tf"),
        hotReload: false,
        log: _garden.log,
        runtimeContext: emptyRuntimeContext,
      })

      expect(status.outputs?.["my-output"]).to.equal("workspace: default, input: foo")
    })
  })

  context("autoApply=true", () => {
    it("should apply a stack on init and use configured variables", async () => {
      await runTestTask(true)
      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("default")
    })

    it("should expose runtime outputs to template contexts", async () => {
      const result = await runTestTask(true)

      expect(result["task.test-task"]!.output.log).to.equal("workspace: default, input: foo")
      expect(result["task.test-task"]!.output.outputs.log).to.equal("workspace: default, input: foo")
    })

    it("sets the workspace before applying", async () => {
      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })

      await _garden.scanAndAddConfigs()
      _garden["moduleConfigs"]["tf"].spec.autoApply = true

      const _graph = await _garden.getConfigGraph(_garden.log)
      const task = _graph.getTask("test-task")

      const taskTask = new TaskTask({
        garden: _garden,
        graph: _graph,
        task,
        log: _garden.log,
        force: false,
        forceBuild: false,
        version: task.module.version,
      })

      const result = await _garden.processTasks([taskTask], { throwOnError: true })
      expect(result["task.test-task"]!.output.outputs.log).to.equal("workspace: foo, input: foo")
    })
  })

  context("allowDestroy=false", () => {
    it("doesn't call terraform destroy when calling the delete service handler", async () => {
      await runTestTask(true, false)

      const actions = await garden.getActionRouter()
      const service = graph.getService("tf")

      await actions.deleteService({ service, log: garden.log })

      const testFileContent = await readFile(testFilePath)
      expect(testFileContent.toString()).to.equal("default")
    })
  })

  context("allowDestroy=true", () => {
    it("calls terraform destroy when calling the delete service handler", async () => {
      await runTestTask(true, true)

      const actions = await garden.getActionRouter()
      const service = graph.getService("tf")

      await actions.deleteService({ service, log: garden.log })

      expect(await pathExists(testFilePath)).to.be.false
    })

    it("sets the workspace before destroying", async () => {
      await runTestTask(true, true)

      const _garden = await makeTestGarden(testRoot, {
        environmentName: "local",
        forceRefresh: true,
        variables: { workspace: "foo" },
      })

      const provider = (await _garden.resolveProvider(_garden.log, "terraform")) as TerraformProvider
      const ctx = await _garden.getPluginContext(provider)
      const actions = await _garden.getActionRouter()
      const _graph = await _garden.getConfigGraph(_garden.log)
      const service = _graph.getService("tf")

      await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

      await actions.deleteService({ service, log: _garden.log })

      const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
      expect(selected).to.equal("foo")
    })
  })
})
