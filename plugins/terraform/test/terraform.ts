/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, resolve } from "path"

import { expect } from "chai"
import { pathExists, readFile, remove } from "fs-extra"

import { getRootLogMessages, makeTestGarden, TestGarden } from "@garden-io/sdk/build/src/testing"
import { findByName } from "@garden-io/core/build/src/util/util"
import { getTerraformCommands } from "../src/commands"
import { ConfigGraph, LogLevel } from "@garden-io/sdk/build/src/types"
import { gardenPlugin } from "../src/index"
import { TerraformProvider } from "../src/provider"
import { DeployTask } from "@garden-io/core/build/src/tasks/deploy"
import { getWorkspaces, setWorkspace } from "../src/helpers"
import { resolveAction } from "@garden-io/core/build/src/graph/actions"
import { RunTask } from "@garden-io/core/build/src/tasks/run"
import { defaultTerraformVersion } from "../src/cli"

for (const terraformVersion of ["0.13.3", defaultTerraformVersion]) {
  describe(`Terraform provider with terraform ${terraformVersion}`, () => {
    const testRoot = resolve(__dirname, "../../test/", "test-project")
    let garden: TestGarden
    let tfRoot: string
    let stateDirPath: string
    let stateDirPathWithWorkspaces: string
    let testFilePath: string

    async function reset() {
      if (tfRoot && (await pathExists(testFilePath))) {
        await remove(testFilePath)
      }
      if (stateDirPath && (await pathExists(stateDirPath))) {
        await remove(stateDirPath)
      }
      if (stateDirPathWithWorkspaces && (await pathExists(stateDirPathWithWorkspaces))) {
        await remove(stateDirPathWithWorkspaces)
      }
    }

    context("autoApply=false", () => {
      beforeEach(async () => {
        await reset()
        garden = await makeTestGarden(testRoot, {
          plugins: [gardenPlugin()],
          environmentString: "prod",
          forceRefresh: true,
          variableOverrides: { "tf-version": terraformVersion },
        })
        tfRoot = join(garden.projectRoot, "tf")
        stateDirPath = join(tfRoot, "terraform.tfstate")
        stateDirPathWithWorkspaces = join(tfRoot, "terraform.tfstate.d")
        testFilePath = join(tfRoot, "test.log")
      })

      after(async () => {
        await reset()
      })

      it("should warn if stack is not up-to-date", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const messages = getRootLogMessages(garden.log, (e) => e.level === LogLevel.warn)
        expect(messages).to.include(
          "Terraform stack is not up-to-date and autoApply is not enabled. Please run garden plugins terraform apply-root to make sure the stack is in the intended state."
        )
        expect(provider.status?.disableCache).to.be.true
      })

      it("should expose outputs to template contexts after applying", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const applyRootCommand = findByName(getTerraformCommands(), "apply-root")!
        await applyRootCommand.handler({
          garden,
          ctx,
          args: ["-auto-approve", "-input=false"],
          log: garden.log,
          graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
        })

        const _garden = await makeTestGarden(testRoot, {
          environmentString: "prod",
          plugins: [gardenPlugin()],
          variableOverrides: { "tf-version": terraformVersion },
        })
        const _provider = await _garden.resolveProvider(_garden.log, "terraform")

        expect(_provider.status!.outputs).to.eql({
          "my-output": "workspace: default, input: foo",
          "test-file-path": "./test.log",
        })
      })

      describe("apply-root command", () => {
        it("calls terraform apply for the project root", async () => {
          const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          const command = findByName(getTerraformCommands(), "apply-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-auto-approve", "-input=false"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })
        })

        it("sets the workspace before running the command", async () => {
          const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
          provider.config.workspace = "foo"

          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          const command = findByName(getTerraformCommands(), "apply-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-auto-approve", "-input=false"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })

          const testFileContent = await readFile(testFilePath)
          expect(testFileContent.toString()).to.equal("foo")
        })
      })

      describe("plan-root command", () => {
        it("calls terraform plan for the project root", async () => {
          const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          const command = findByName(getTerraformCommands(), "plan-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-input=false"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })
        })

        it("sets the workspace before running the command", async () => {
          const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
          provider.config.workspace = "foo"

          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          const command = findByName(getTerraformCommands(), "plan-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-input=false"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })

          const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: garden.log })
          expect(selected).to.equal("foo")
        })
      })

      describe("destroy-root command", () => {
        it("calls terraform destroy for the project root", async () => {
          const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          const command = findByName(getTerraformCommands(), "destroy-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-input=false", "-auto-approve"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })
        })

        it("sets the workspace before running the command", async () => {
          const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
          provider.config.workspace = "foo"

          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          const command = findByName(getTerraformCommands(), "destroy-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-input=false", "-auto-approve"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })

          const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: garden.log })
          expect(selected).to.equal("foo")
        })
      })

      context("allowDestroy=false", () => {
        it("doesn't call terraform destroy when calling the delete service handler", async () => {
          const provider = await garden.resolveProvider(garden.log, "terraform")
          const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

          // This creates the test file
          const command = findByName(getTerraformCommands(), "apply-root")!
          await command.handler({
            garden,
            ctx,
            args: ["-auto-approve", "-input=false"],
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })

          const actions = await garden.getActionRouter()
          await actions.provider.cleanupEnvironment({ log: garden.log, pluginName: "terraform" })

          // File should still exist
          const testFileContent = await readFile(testFilePath)
          expect(testFileContent.toString()).to.equal("default")
        })
      })
    })

    context("autoApply=true", () => {
      before(async () => {
        garden = await makeTestGarden(testRoot, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "tf-version": terraformVersion },
        })
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
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "workspace": "foo",
            "tf-version": terraformVersion,
          },
          plugins: [gardenPlugin()],
        })
        await _garden.resolveProvider(garden.log, "terraform")
        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("foo")
      })

      it("should expose outputs to template contexts", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        expect(provider.status!.outputs).to.eql({
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
          await actions.provider.cleanupEnvironment({ log: garden.log, pluginName: "terraform" })

          expect(await pathExists(testFilePath)).to.be.false
        })
      })
    })
  })

  describe("Terraform action type", () => {
    const testRoot = resolve(__dirname, "../../test/", "test-project-action")
    const tfRoot = join(testRoot, "tf")
    const stateDirPath = join(tfRoot, "terraform.tfstate")
    const testFilePath = join(tfRoot, "test.log")

    let garden: TestGarden
    let graph: ConfigGraph

    async function reset() {
      if (testFilePath && (await pathExists(testFilePath))) {
        await remove(testFilePath)
      }
      if (stateDirPath && (await pathExists(stateDirPath))) {
        await remove(stateDirPath)
      }
    }

    beforeEach(async () => {
      await reset()
      garden = await makeTestGarden(testRoot, {
        plugins: [gardenPlugin()],
        variableOverrides: { "tf-version": terraformVersion },
      })
    })

    after(async () => {
      await reset()
    })

    async function deployStack(autoApply: boolean) {
      await garden.scanAndAddConfigs()
      garden["actionConfigs"]["Deploy"]["tf"].spec.autoApply = autoApply

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const action = await resolveAction({
        garden,
        graph,
        action: graph.getDeploy("tf"),
        log: garden.log,
      })

      const deployTask = new DeployTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: false,
        forceBuild: false,
      })

      return garden.processTasks({ tasks: [deployTask], throwOnError: true })
    }

    async function runTestTask(autoApply: boolean, allowDestroy = false) {
      await garden.scanAndAddConfigs()
      garden["actionConfigs"]["Deploy"]["tf"].spec.allowDestroy = allowDestroy
      garden["actionConfigs"]["Deploy"]["tf"].spec.autoApply = autoApply

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const action = await resolveAction({
        garden,
        graph,
        action: graph.getRun("test-task"),
        log: garden.log,
      })

      const taskTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: false,
        forceBuild: false,
      })

      return garden.processTasks({ tasks: [taskTask], throwOnError: true })
    }

    describe("apply-action command", () => {
      it("calls terraform apply for the action", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "apply-action")!
        await command.handler({
          ctx,
          garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: garden.log,
          graph,
        })
      })

      it("sets the workspace before running the command", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "apply-action")!
        await command.handler({
          ctx,
          garden: _garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: _garden.log,
          graph: _graph,
        })

        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("foo")
      })
    })

    describe("plan-action command", () => {
      it("calls terraform apply for the action root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "plan-action")!
        await command.handler({
          ctx,
          garden,
          args: ["tf", "-input=false"],
          log: garden.log,
          graph,
        })
      })

      it("sets the workspace before running the command", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const _ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await setWorkspace({ ctx: _ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "plan-action")!
        await command.handler({
          ctx: _ctx,
          garden: _garden,
          args: ["tf", "-input=false"],
          log: _garden.log,
          graph: _graph,
        })

        const { selected } = await getWorkspaces({ ctx: _ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })

    describe("destroy-action command", () => {
      it("calls terraform destroy for the action root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "destroy-action")!
        await command.handler({
          ctx,
          garden,
          args: ["tf", "-input=false", "-auto-approve"],
          log: garden.log,
          graph,
        })
      })

      it("sets the workspace before running the command", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(_garden.log, "terraform")) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "destroy-action")!
        await command.handler({
          ctx,
          garden: _garden,
          args: ["tf", "-input=false", "-auto-approve"],
          log: _garden.log,
          graph,
        })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })

    context("autoApply=false", () => {
      it("should warn if the stack is out of date", async () => {
        await deployStack(false)
        const messages = getRootLogMessages(garden.log, (e) => e.level === LogLevel.warn)
        expect(messages).to.include(
          "Stack is out-of-date but autoApply is set to false, so it will not be applied automatically. If any newly added stack outputs are referenced via ${runtime.services.tf.outputs.*} template strings and are missing, you may see errors when resolving them."
        )
      })

      it("should expose runtime outputs to template contexts if stack had already been applied", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const applyCommand = findByName(getTerraformCommands(), "apply-action")!
        await applyCommand.handler({
          ctx,
          garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: garden.log,
          graph,
        })

        const { error, results } = await runTestTask(false)
        expect(error).to.be.null
        const task = results["results"].get("run.test-task")!
        expect(task.outputs.log).to.equal("workspace: default, input: foo")
        expect(task.result.outputs.log).to.equal("workspace: default, input: foo")
      })

      it("should return outputs with the service status", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const applyCommand = findByName(getTerraformCommands(), "apply-action")!
        await applyCommand.handler({
          ctx,
          garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: garden.log,
          graph,
        })

        const resolvedAction = await resolveAction({
          garden,
          graph,
          action: graph.getDeploy("tf"),
          log: garden.log,
        })

        const actions = await garden.getActionRouter()
        const status = await actions.deploy.getStatus({
          action: resolvedAction,
          log: resolvedAction.createLog(garden.log),
          graph,
        })

        expect(status.result.outputs).to.eql({
          "map-output": {
            first: "second",
          },
          "my-output": "workspace: default, input: foo",
          "test-file-path": "./test.log",
        })
      })

      it("sets the workspace before getting the status and returning outputs", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = await _garden.resolveProvider(_garden.log, "terraform")
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
        const applyCommand = findByName(getTerraformCommands(), "apply-action")!
        await applyCommand.handler({
          ctx,
          garden: _garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: _garden.log,
          graph: _graph,
        })

        const resolvedAction = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getDeploy("tf"),
          log: _garden.log,
        })

        const actions = await _garden.getActionRouter()
        const status = await actions.deploy.getStatus({
          action: resolvedAction,
          log: resolvedAction.createLog(_garden.log),
          graph: _graph,
        })

        expect(status.result.outputs?.["my-output"]).to.equal("workspace: foo, input: foo")
      })
    })

    context("autoApply=true", () => {
      it("should apply a stack on init and use configured variables", async () => {
        await runTestTask(true)
        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("default")
      })

      it("should expose runtime outputs to template contexts", async () => {
        const { error, results } = await runTestTask(true)
        expect(error).to.be.null
        const task = results["results"].get("run.test-task")!
        expect(task.outputs.log).to.equal("workspace: default, input: foo")
        expect(task.result.outputs.log).to.equal("workspace: default, input: foo")
      })

      it("sets the workspace before applying", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        await _garden.scanAndAddConfigs()
        _garden["actionConfigs"]["Deploy"]["tf"].spec.autoApply = true

        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const resolvedAction = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getRun("test-task"),
          log: garden.log,
        })

        const runTask = new RunTask({
          garden: _garden,
          graph: _graph,
          action: resolvedAction,
          log: _garden.log,
          force: false,
          forceBuild: false,
        })

        const { error, results } = await _garden.processTasks({ tasks: [runTask], throwOnError: true })
        expect(error).to.be.null
        const task = results["results"].get("run.test-task")!
        expect(task.outputs.log).to.equal("workspace: foo, input: foo")
        expect(task.result.outputs.log).to.equal("workspace: foo, input: foo")
      })
    })

    context("allowDestroy=false", () => {
      it("doesn't call terraform destroy when calling the delete service handler", async () => {
        await runTestTask(true, false)

        const actions = await garden.getActionRouter()
        const action = await resolveAction({
          garden,
          graph,
          action: graph.getDeploy("tf"),
          log: garden.log,
        })
        await actions.deploy.delete({ action, log: action.createLog(garden.log), graph })

        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("default")
      })
    })

    context("allowDestroy=true", () => {
      it("calls terraform destroy when calling the delete service handler", async () => {
        await runTestTask(true, true)

        const actions = await garden.getActionRouter()

        const action = await resolveAction({
          garden,
          graph,
          action: graph.getDeploy("tf"),
          log: garden.log,
        })

        await actions.deploy.delete({ action, log: action.createLog(garden.log), graph })

        expect(await pathExists(testFilePath)).to.be.false
      })

      it("sets the workspace before destroying", async () => {
        await runTestTask(true, true)

        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(_garden.log, "terraform")) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const actions = await _garden.getActionRouter()
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
        const _action = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getDeploy("tf"),
          log: _garden.log,
        })

        await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        await actions.deploy.delete({ action: _action, log: _action.createLog(_garden.log), graph: _graph })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })
  })

  describe("Terraform module type", () => {
    const testRoot = resolve(__dirname, "../../test/", "test-project-module")
    const tfRoot = join(testRoot, "tf")
    const stateDirPath = join(tfRoot, "terraform.tfstate")
    const testFilePath = join(tfRoot, "test.log")

    let garden: TestGarden
    let graph: ConfigGraph

    async function reset() {
      if (testFilePath && (await pathExists(testFilePath))) {
        await remove(testFilePath)
      }
      if (stateDirPath && (await pathExists(stateDirPath))) {
        await remove(stateDirPath)
      }
    }

    beforeEach(async () => {
      await reset()
      garden = await makeTestGarden(testRoot, {
        plugins: [gardenPlugin()],
        variableOverrides: { "tf-version": terraformVersion },
      })
    })

    after(async () => {
      await reset()
    })

    async function deployStack(autoApply: boolean) {
      await garden.scanAndAddConfigs()
      garden["moduleConfigs"]["tf"].spec.autoApply = autoApply

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const action = await resolveAction({
        garden,
        graph,
        action: graph.getDeploy("tf"),
        log: garden.log,
      })

      const deployTask = new DeployTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: false,
        forceBuild: false,
      })

      return garden.processTasks({ tasks: [deployTask], throwOnError: true })
    }

    async function runTestTask(autoApply: boolean, allowDestroy = false) {
      await garden.scanAndAddConfigs()
      garden["moduleConfigs"]["tf"].spec.allowDestroy = allowDestroy
      garden["moduleConfigs"]["tf"].spec.autoApply = autoApply

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const action = await resolveAction({
        garden,
        graph,
        action: graph.getRun("test-task"),
        log: garden.log,
      })

      const taskTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: false,
        forceBuild: false,
      })

      return garden.processTasks({ tasks: [taskTask], throwOnError: true })
    }

    describe("apply-action command", () => {
      it("calls terraform apply for the action", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "apply-action")!
        await command.handler({
          ctx,
          garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: garden.log,
          graph,
        })
      })

      it("sets the workspace before running the command", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "apply-action")!
        await command.handler({
          ctx,
          garden: _garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: _garden.log,
          graph: _graph,
        })

        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("foo")
      })
    })

    describe("plan-action command", () => {
      it("calls terraform apply for the action root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "plan-action")!
        await command.handler({
          ctx,
          garden,
          args: ["tf", "-input=false"],
          log: garden.log,
          graph,
        })
      })

      it("sets the workspace before running the command", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const _ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await setWorkspace({ ctx: _ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "plan-action")!
        await command.handler({
          ctx: _ctx,
          garden: _garden,
          args: ["tf", "-input=false"],
          log: _garden.log,
          graph: _graph,
        })

        const { selected } = await getWorkspaces({ ctx: _ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })

    describe("destroy-action command", () => {
      it("calls terraform destroy for the action root", async () => {
        const provider = (await garden.resolveProvider(garden.log, "terraform")) as TerraformProvider
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "destroy-action")!
        await command.handler({
          ctx,
          garden,
          args: ["tf", "-input=false", "-auto-approve"],
          log: garden.log,
          graph,
        })
      })

      it("sets the workspace before running the command", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(_garden.log, "terraform")) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const command = findByName(getTerraformCommands(), "destroy-action")!
        await command.handler({
          ctx,
          garden: _garden,
          args: ["tf", "-input=false", "-auto-approve"],
          log: _garden.log,
          graph,
        })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })

    context("autoApply=false", () => {
      it("should warn if the stack is out of date", async () => {
        await deployStack(false)
        const messages = getRootLogMessages(garden.log, (e) => e.level === LogLevel.warn)
        expect(messages).to.include(
          "Stack is out-of-date but autoApply is set to false, so it will not be applied automatically. If any newly added stack outputs are referenced via ${runtime.services.tf.outputs.*} template strings and are missing, you may see errors when resolving them."
        )
      })

      it("should expose runtime outputs to template contexts if stack had already been applied", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const applyCommand = findByName(getTerraformCommands(), "apply-action")!
        await applyCommand.handler({
          ctx,
          garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: garden.log,
          graph,
        })

        const { error, results } = await runTestTask(false)
        expect(error).to.be.null
        const task = results["results"].get("run.test-task")!
        expect(task.outputs.log).to.equal("workspace: default, input: foo")
        expect(task.result.outputs.log).to.equal("workspace: default, input: foo")
      })

      it("should return outputs with the service status", async () => {
        const provider = await garden.resolveProvider(garden.log, "terraform")
        const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const applyCommand = findByName(getTerraformCommands(), "apply-action")!
        await applyCommand.handler({
          ctx,
          garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: garden.log,
          graph,
        })

        const resolvedAction = await resolveAction({
          garden,
          graph,
          action: graph.getDeploy("tf"),
          log: garden.log,
        })

        const actions = await garden.getActionRouter()
        const status = await actions.deploy.getStatus({
          action: resolvedAction,
          log: resolvedAction.createLog(garden.log),
          graph,
        })

        expect(status.result.outputs).to.eql({
          "map-output": {
            first: "second",
          },
          "my-output": "workspace: default, input: foo",
          "test-file-path": "./test.log",
        })
      })

      it("sets the workspace before getting the status and returning outputs", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = await _garden.resolveProvider(_garden.log, "terraform")
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
        const applyCommand = findByName(getTerraformCommands(), "apply-action")!
        await applyCommand.handler({
          ctx,
          garden: _garden,
          args: ["tf", "-auto-approve", "-input=false"],
          log: _garden.log,
          graph: _graph,
        })

        const resolvedAction = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getDeploy("tf"),
          log: _garden.log,
        })

        const actions = await _garden.getActionRouter()
        const status = await actions.deploy.getStatus({
          action: resolvedAction,
          log: resolvedAction.createLog(_garden.log),
          graph: _graph,
        })

        expect(status.result.outputs?.["my-output"]).to.equal("workspace: foo, input: foo")
      })
    })

    context("autoApply=true", () => {
      it("should apply a stack on init and use configured variables", async () => {
        await runTestTask(true)
        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("default")
      })

      it("should expose runtime outputs to template contexts", async () => {
        const { error, results } = await runTestTask(true)
        expect(error).to.be.null
        const task = results["results"].get("run.test-task")!
        expect(task.outputs.log).to.equal("workspace: default, input: foo")
        expect(task.result.outputs.log).to.equal("workspace: default, input: foo")
      })

      it("sets the workspace before applying", async () => {
        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        await _garden.scanAndAddConfigs()
        _garden["moduleConfigs"]["tf"].spec.autoApply = true
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        const resolvedAction = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getRun("test-task"),
          log: garden.log,
        })

        const runTask = new RunTask({
          garden: _garden,
          graph: _graph,
          action: resolvedAction,
          log: _garden.log,
          force: false,
          forceBuild: false,
        })

        const { error, results } = await _garden.processTasks({ tasks: [runTask], throwOnError: true })
        expect(error).to.be.null
        const task = results["results"].get("run.test-task")!
        expect(task.outputs.log).to.equal("workspace: foo, input: foo")
        expect(task.result.outputs.log).to.equal("workspace: foo, input: foo")
      })
    })

    context("allowDestroy=false", () => {
      it("doesn't call terraform destroy when calling the delete service handler", async () => {
        await runTestTask(true, false)

        const actions = await garden.getActionRouter()
        const action = await resolveAction({
          garden,
          graph,
          action: graph.getDeploy("tf"),
          log: garden.log,
        })
        await actions.deploy.delete({ action, log: action.createLog(garden.log), graph })

        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("default")
      })
    })

    context("allowDestroy=true", () => {
      it("calls terraform destroy when calling the delete service handler", async () => {
        await runTestTask(true, true)

        const actions = await garden.getActionRouter()

        const action = await resolveAction({
          garden,
          graph,
          action: graph.getDeploy("tf"),
          log: garden.log,
        })

        await actions.deploy.delete({ action, log: action.createLog(garden.log), graph })

        expect(await pathExists(testFilePath)).to.be.false
      })

      it("sets the workspace before destroying", async () => {
        await runTestTask(true, true)

        const _garden = await makeTestGarden(testRoot, {
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "workspace": "foo", "tf-version": terraformVersion },
          plugins: [gardenPlugin()],
        })

        const provider = (await _garden.resolveProvider(_garden.log, "terraform")) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const actions = await _garden.getActionRouter()
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
        const _action = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getDeploy("tf"),
          log: _garden.log,
        })

        await setWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        await actions.deploy.delete({ action: _action, log: _action.createLog(_garden.log), graph: _graph })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })
  })
}
