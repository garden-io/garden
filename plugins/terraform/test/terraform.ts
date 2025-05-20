/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dirname, join, resolve } from "node:path"
import http from "node:http"
import getPort from "get-port"

import { expect } from "chai"
import fsExtra from "fs-extra"
const { pathExists, readFile, remove } = fsExtra

import type { TestGarden } from "@garden-io/sdk/build/src/testing.js"
import { getRootLogMessages, makeTestGarden } from "@garden-io/sdk/build/src/testing.js"
import { findByName } from "@garden-io/core/build/src/util/util.js"
import { getTerraformCommands } from "../src/commands.js"
import type { ConfigGraph } from "@garden-io/sdk/build/src/types.js"
import { LogLevel } from "@garden-io/sdk/build/src/types.js"
import { gardenPlugin } from "../src/index.js"
import type { TerraformProvider } from "../src/provider.js"
import { DeployTask } from "@garden-io/core/build/src/tasks/deploy.js"
import { getWorkspaces, ensureWorkspace } from "../src/helpers.js"
import { resolveAction } from "@garden-io/core/build/src/graph/actions.js"
import { RunTask } from "@garden-io/core/build/src/tasks/run.js"
import { defaultTerraformVersion } from "../src/cli.js"
import { fileURLToPath } from "node:url"
import { resolveMsg } from "@garden-io/core/build/src/logger/log-entry.js"
import { getRootLogger, type Logger } from "@garden-io/core/build/src/logger/logger.js"
import { type TerraformDeploy } from "../src/action.js"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

/**
 * A mock http server that intercepts Terraform calls for getting/posting state
 * to an "http" backend.
 *
 * Used for testing the `backendConfig` logic.
 */
export class TerraformMockBackendServer {
  private server: http.Server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private interceptedRequests: any[] = []
  private port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private state: any = null

  constructor(port: number = 9090) {
    this.port = port

    this.server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (chunk) => (body += chunk))

      req.on("end", () => {
        // Log the request
        const request = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
          timestamp: new Date(),
        }
        this.interceptedRequests.push(request)

        const mockState = {
          version: 4,
          terraform_version: "1.5.0",
          serial: 1,
          lineage: "123e4567-e89b-12d3-a456-426614174000",
          outputs: {},
          resources: [],
          check_results: null,
        }

        // Handle different state operations
        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify(mockState))
        } else if (req.method === "POST") {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ status: "success" }))
        }
      })
    })
  }

  start(): Promise<void> {
    return new Promise((res) => {
      this.server.listen(this.port, () => {
        res()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((res) => {
      this.server.close(() => {
        res()
      })
    })
  }

  getInterceptedRequests() {
    return this.interceptedRequests
  }

  clearInterceptedRequests() {
    this.interceptedRequests = []
  }
}
for (const terraformVersion of ["0.13.3", defaultTerraformVersion]) {
  describe(`Terraform provider with terraform ${terraformVersion}`, () => {
    const testRoot = resolve(moduleDirName, "../../test/", "test-project")
    let garden: TestGarden
    let tfRoot: string
    let stateDirPath: string
    let stateDirPathWithWorkspaces: string
    let testFilePath: string

    async function reset() {
      if (garden?.log?.root) {
        garden.log.root["entries"].length = 0
      }

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
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
        const messages = getRootLogMessages(garden.log, (e) => e.level === LogLevel.warn)
        expect(messages).to.include(
          "Terraform stack is not up-to-date and autoApply is not enabled. Please run garden plugins terraform apply-root to make sure the stack is in the intended state."
        )
        expect(provider.status.disableCache).to.be.true
      })

      it("should expose outputs to template contexts after applying", async () => {
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
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
        const _provider = await _garden.resolveProvider({ log: _garden.log, name: "terraform" })

        expect(_provider.status.outputs).to.eql({
          "my-output": "workspace: default, input: foo",
          "test-file-path": "./test.log",
        })
      })

      describe("apply-root command", () => {
        it("calls terraform apply for the project root", async () => {
          const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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
          const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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
          const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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
          const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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
          const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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
          const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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
          const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
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
      beforeEach(async () => {
        garden = await makeTestGarden(testRoot, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: { "tf-version": terraformVersion },
        })
        tfRoot = join(garden.projectRoot, "tf")
        stateDirPath = join(tfRoot, "terraform.tfstate")
        stateDirPathWithWorkspaces = join(tfRoot, "terraform.tfstate.d")
        testFilePath = join(tfRoot, "test.log")
        await reset()
      })

      after(async () => {
        await reset()
      })

      it("should apply a stack on init and use configured variables", async () => {
        await garden.resolveProvider({ log: garden.log, name: "terraform" })
        expect(
          garden.log.root
            .getLogEntries()
            .filter((l) =>
              resolveMsg(l)?.match(/Apply complete\! Resources: [0-9]+ added, [0-9]+ changed, [0-9]+ destroyed/)
            ).length
        ).to.be.greaterThan(0)
        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("default")
      })

      it("should not apply a stack when the provider is resolved with statusOnly=true e.g. while running validate command", async () => {
        await garden.resolveProvider({ log: garden.log, name: "terraform", statusOnly: true })
        expect(
          garden.log.root
            .getLogEntries()
            .filter((l) => resolveMsg(l)?.match(/Provider is not ready \(only checking status\)/)).length
        ).to.be.greaterThan(0)
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
        await _garden.resolveProvider({ log: garden.log, name: "terraform" })
        const testFileContent = await readFile(testFilePath)
        expect(testFileContent.toString()).to.equal("foo")
      })

      it("should expose outputs to template contexts", async () => {
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
        expect(provider.status.outputs).to.eql({
          "my-output": "workspace: default, input: foo",
          "test-file-path": "./test.log",
        })
      })

      context("allowDestroy=true", () => {
        it("calls terraform destroy when calling the delete service handler", async () => {
          // This implicitly creates the test file
          await garden.resolveProvider({ log: garden.log, name: "terraform" })

          // This should remove the file
          const actions = await garden.getActionRouter()
          await actions.provider.cleanupEnvironment({ log: garden.log, pluginName: "terraform" })

          expect(await pathExists(testFilePath)).to.be.false
        })
      })
    })

    context("backendConfig defined", () => {
      const testRootBackendConfig = resolve(moduleDirName, "../../test/", "test-project-backendconfig")
      tfRoot = join(testRootBackendConfig, "tf")
      stateDirPath = join(tfRoot, ".terraform")

      let server: TerraformMockBackendServer
      let port: number

      before(async () => {
        port = await getPort()
        server = new TerraformMockBackendServer(port)
        await server.start()
      })

      beforeEach(async () => {
        await reset()
        server.clearInterceptedRequests()
      })

      afterEach(async () => {
        getRootLogger()["entries"] = []
      })

      after(async () => {
        await server.stop()
      })

      it("should dynamically set backend config", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfig, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
            "address": `http://localhost:${port}/terraform/state?some-dynamic-key`,
          },
        })
        await testGarden.resolveProvider({ log: testGarden.log, name: "terraform" })

        const requests = server.getInterceptedRequests()
        const requestUrl = requests[0].url
        const messages = getRootLogMessages(testGarden.log, (e) => e.level === LogLevel.info)

        expect(requestUrl).to.eql("/terraform/state?some-dynamic-key")
        expect(messages).to.not.include(
          "Detected change in backend config, will re-initialize Terraform with '-reconfigure' flag"
        )
      })

      it("should NOT re-initialize Terraform if no state file present", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfig, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
            "address": `http://localhost:${port}/terraform/state?some-dynamic-key`,
          },
        })
        await testGarden.resolveProvider({ log: testGarden.log, name: "terraform" })

        const messages = getRootLogMessages(testGarden.log, (e) => e.level === LogLevel.info)
        // A fresh test project won't have a statefile
        expect(messages).to.not.include(
          "Detected change in backend config, will re-initialize Terraform with '-reconfigure' flag"
        )
      })

      it("should re-initialize Terraform with -reconfigure flag if backendConfig changes", async () => {
        const testGardenA = await makeTestGarden(testRootBackendConfig, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
            "address": `http://localhost:${port}/terraform/state?some-dynamic-key`,
          },
        })
        await testGardenA.resolveProvider({ log: testGardenA.log, name: "terraform" })

        // Reset logger before running Garden again
        const logger: Logger = getRootLogger()
        logger["entries"] = []

        const testGardenB = await makeTestGarden(testRootBackendConfig, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
            "address": `http://localhost:${port}/terraform/state?some-other-dynamic-key`,
          },
        })
        //
        await testGardenB.resolveProvider({ log: testGardenB.log, name: "terraform" })

        const requests = server.getInterceptedRequests()
        const messages = getRootLogMessages(testGardenB.log, (e) => e.level === LogLevel.info)
        const requestUrlForGardenA = requests[0].url
        // Grab the last request to get one from the second Garden run
        const requestUrlForGardenB = requests[requests.length - 1].url

        expect(requestUrlForGardenA).to.eql("/terraform/state?some-dynamic-key")
        expect(requestUrlForGardenB).to.eql("/terraform/state?some-other-dynamic-key")
        expect(messages).to.include(
          "Detected change in backend config, will re-initialize Terraform with '-reconfigure' flag"
        )
      })

      it("uses backendConfig for commamnds", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfig, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
            "address": `http://localhost:${port}/terraform/state?some-dynamic-key-using-plugin-command`,
          },
        })
        const provider = (await testGarden.resolveProvider({
          log: testGarden.log,
          statusOnly: true,
          name: "terraform",
        })) as TerraformProvider
        const ctx = await testGarden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const graph = await testGarden.getConfigGraph({ log: testGarden.log, emit: false })
        const command = findByName(getTerraformCommands(), "plan-root")!
        await command.handler({
          ctx,
          garden: testGarden,
          args: ["-input=false"],
          log: testGarden.log,
          graph,
        })

        const requests = server.getInterceptedRequests()
        console.log("**REQUESTS***")
        console.log(JSON.stringify(requests, null, 4))
        const requestUrl = requests[0].url
        expect(requestUrl).to.eql("/terraform/state?some-dynamic-key-using-plugin-command")
      })
    })
  })

  describe("Terraform action type", () => {
    const testRoot = resolve(moduleDirName, "../../test/", "test-project-action")
    let tfRoot = join(testRoot, "tf")
    let stateDirPath = join(tfRoot, "terraform.tfstate")
    const backupStateDirPath = join(tfRoot, "terraform.tfstate.backup")
    const stateDirPathWithWorkspaces = join(tfRoot, "terraform.tfstate.d")
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
      if (stateDirPathWithWorkspaces && (await pathExists(stateDirPathWithWorkspaces))) {
        await remove(stateDirPathWithWorkspaces)
      }
      if (backupStateDirPath && (await pathExists(backupStateDirPath))) {
        await remove(backupStateDirPath)
      }
    }

    beforeEach(async () => {
      tfRoot = join(testRoot, "tf")
      stateDirPath = join(tfRoot, "terraform.tfstate")

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
      garden.actionConfigs["Deploy"]["tf"].spec.autoApply = autoApply

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
      garden.actionConfigs["Deploy"]["tf"].spec.allowDestroy = allowDestroy
      garden.actionConfigs["Deploy"]["tf"].spec.autoApply = autoApply

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
        const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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

        const provider = (await _garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await ensureWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

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
        const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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

        const provider = (await _garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
        const _ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await ensureWorkspace({ ctx: _ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

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
        const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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

        const provider = (await _garden.resolveProvider({ log: _garden.log, name: "terraform" })) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await ensureWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

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
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
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
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
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

        const provider = await _garden.resolveProvider({ log: _garden.log, name: "terraform" })
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

        expect(
          garden.log.root
            .getLogEntries()
            .filter((l) =>
              resolveMsg(l)?.match(/Apply complete\! Resources: [0-9]+ added, [0-9]+ changed, [0-9]+ destroyed/)
            ).length
        ).to.be.greaterThan(0)
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
        _garden.actionConfigs["Deploy"]["tf"].spec.autoApply = true

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

        const provider = (await _garden.resolveProvider({ log: _garden.log, name: "terraform" })) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const actions = await _garden.getActionRouter()
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
        const _action = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getDeploy("tf"),
          log: _garden.log,
        })

        await ensureWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        await actions.deploy.delete({ action: _action, log: _action.createLog(_garden.log), graph: _graph })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })

    context("backendConfig defined", () => {
      const testRootBackendConfigAction = resolve(moduleDirName, "../../test/", "test-project-backendconfig-action")
      tfRoot = join(testRootBackendConfigAction, "tf")
      stateDirPath = join(tfRoot, ".terraform")

      let server: TerraformMockBackendServer
      let port: number

      before(async () => {
        port = await getPort()
        server = new TerraformMockBackendServer(port)
        await server.start()
      })

      beforeEach(async () => {
        tfRoot = join(testRootBackendConfigAction, "tf")
        stateDirPath = join(tfRoot, ".terraform")
        await reset()
        server.clearInterceptedRequests()
      })

      afterEach(async () => {
        getRootLogger()["entries"] = []
      })

      after(async () => {
        await server.stop()
      })

      it("should dynamically set backend config", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfigAction, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
          },
        })
        graph = await testGarden.getConfigGraph({ log: testGarden.log, emit: false })
        const action = graph.getDeploy("tf-backendconfig-deploy") as TerraformDeploy
        action._config.spec.backendConfig = {
          address: `http://localhost:${port}/terraform/state?some-dynamic-key-for-action`,
        }
        const resolvedAction = await resolveAction<TerraformDeploy>({
          garden: testGarden,
          graph,
          action,
          log: garden.log,
        })
        const deployTask = new DeployTask({
          garden: testGarden,
          graph,
          action: resolvedAction,
          log: testGarden.log,
          force: false,
          forceBuild: false,
        })
        await testGarden.processTasks({ tasks: [deployTask], throwOnError: true })

        const requests = server.getInterceptedRequests()
        const requestUrl = requests[0].url

        expect(requestUrl).to.eql("/terraform/state?some-dynamic-key-for-action")
      })

      it("should NOT re-initialize Terraform if no state file present", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfigAction, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
          },
        })
        graph = await testGarden.getConfigGraph({ log: testGarden.log, emit: false })
        const action = graph.getDeploy("tf-backendconfig-deploy") as TerraformDeploy
        action._config.spec.backendConfig = {
          address: `http://localhost:${port}/terraform/state?some-dynamic-key-for-action`,
        }
        const resolvedAction = await resolveAction<TerraformDeploy>({
          garden: testGarden,
          graph,
          action,
          log: garden.log,
        })
        const deployTask = new DeployTask({
          garden: testGarden,
          graph,
          action: resolvedAction,
          log: testGarden.log,
          force: false,
          forceBuild: false,
        })
        await testGarden.processTasks({ tasks: [deployTask], throwOnError: true })

        const messages = getRootLogMessages(testGarden.log, (e) => e.level === LogLevel.info)
        // A fresh test project won't have a statefile
        expect(messages).to.not.include(
          "Detected change in backend config, will re-initialize Terraform with '-reconfigure' flag"
        )
      })

      it("should re-initialize Terraform with -reconfigure flag if backendConfig changes", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfigAction, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          forceRefresh: true,
          variableOverrides: {
            "tf-version": terraformVersion,
          },
        })

        graph = await testGarden.getConfigGraph({ log: testGarden.log, emit: false })
        const action = graph.getDeploy("tf-backendconfig-deploy") as TerraformDeploy

        action._config.spec.backendConfig = {
          address: `http://localhost:${port}/terraform/state?some-dynamic-key-for-action`,
        }
        const resolvedActionA = await resolveAction<TerraformDeploy>({
          garden: testGarden,
          graph,
          action,
          log: garden.log,
        })
        const deployTaskA = new DeployTask({
          garden: testGarden,
          graph,
          action: resolvedActionA,
          log: testGarden.log,
          force: false,
          forceBuild: false,
        })
        await testGarden.processTasks({ tasks: [deployTaskA], throwOnError: true })

        // Reset logger before running Garden again since it's a singleton
        const logger: Logger = getRootLogger()
        logger["entries"] = []

        action._config.spec.backendConfig = {
          address: `http://localhost:${port}/terraform/state?some-other-dynamic-key-for-action`,
        }
        const resolvedActionB = await resolveAction<TerraformDeploy>({
          garden: testGarden,
          graph,
          action,
          log: garden.log,
        })
        const deployTaskB = new DeployTask({
          garden: testGarden,
          graph,
          action: resolvedActionB,
          log: testGarden.log,
          force: false,
          forceBuild: false,
        })
        await testGarden.processTasks({ tasks: [deployTaskB], throwOnError: true })

        const requests = server.getInterceptedRequests()
        const messages = getRootLogMessages(testGarden.log, (e) => e.level === LogLevel.info)
        const firstRequestUrl = requests[0].url
        // Grab the last request to get one from the second Garden run
        const lastRequestUrl = requests[requests.length - 1].url

        expect(firstRequestUrl).to.eql("/terraform/state?some-dynamic-key-for-action")
        expect(lastRequestUrl).to.eql("/terraform/state?some-other-dynamic-key-for-action")
        expect(messages).to.include(
          "Detected change in backend config, will re-initialize Terraform with '-reconfigure' flag"
        )
      })

      it("uses backendConfig for commamnds", async () => {
        const testGarden = await makeTestGarden(testRootBackendConfigAction, {
          plugins: [gardenPlugin()],
          environmentString: "local",
          variableOverrides: {
            "tf-version": terraformVersion,
          },
        })
        const provider = (await testGarden.resolveProvider({
          log: testGarden.log,
          statusOnly: true,
          name: "terraform",
        })) as TerraformProvider
        const ctx = await testGarden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const graph = await testGarden.getConfigGraph({ log: testGarden.log, emit: false })
        const action = graph.getDeploy("tf-backendconfig-deploy") as TerraformDeploy
        action._config.spec.backendConfig = {
          address: `http://localhost:${port}/terraform/state?some-dynamic-key-for-action-using-plugin-command`,
        }

        const command = findByName(getTerraformCommands(), "plan-action")!
        await command.handler({
          ctx,
          garden: testGarden,
          args: ["tf-backendconfig-deploy", "-input=false"],
          log: garden.log,
          graph,
        })

        const requests = server.getInterceptedRequests()
        const requestUrl = requests[0].url
        expect(requestUrl).to.eql("/terraform/state?some-dynamic-key-for-action-using-plugin-command")
      })
    })
  })

  describe("Terraform module type", () => {
    const testRoot = resolve(moduleDirName, "../../test/", "test-project-module")
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
        const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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

        const provider = (await _garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await ensureWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

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
        const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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

        const provider = (await _garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
        const _ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await ensureWorkspace({ ctx: _ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

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
        const provider = (await garden.resolveProvider({ log: garden.log, name: "terraform" })) as TerraformProvider
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

        const provider = (await _garden.resolveProvider({ log: _garden.log, name: "terraform" })) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

        await ensureWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

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
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
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
        const provider = await garden.resolveProvider({ log: garden.log, name: "terraform" })
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

        const provider = await _garden.resolveProvider({ log: _garden.log, name: "terraform" })
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
        expect(
          garden.log.root
            .getLogEntries()
            .filter((l) =>
              resolveMsg(l)?.match(/Apply complete\! Resources: [0-9]+ added, [0-9]+ changed, [0-9]+ destroyed/)
            ).length
        ).to.be.greaterThan(0)
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

        const provider = (await _garden.resolveProvider({ log: _garden.log, name: "terraform" })) as TerraformProvider
        const ctx = await _garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
        const actions = await _garden.getActionRouter()
        const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
        const _action = await resolveAction({
          garden: _garden,
          graph: _graph,
          action: _graph.getDeploy("tf"),
          log: _garden.log,
        })

        await ensureWorkspace({ ctx, provider, root: tfRoot, log: _garden.log, workspace: "default" })

        await actions.deploy.delete({ action: _action, log: _action.createLog(_garden.log), graph: _graph })

        const { selected } = await getWorkspaces({ ctx, provider, root: tfRoot, log: _garden.log })
        expect(selected).to.equal("foo")
      })
    })
  })
}
