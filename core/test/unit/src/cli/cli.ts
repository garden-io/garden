/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { isEqual } from "lodash"

import { makeDummyGarden, GardenCli } from "../../../../src/cli/cli"
import {
  getDataDir,
  TestGarden,
  makeTestGardenA,
  enableAnalytics,
  projectRootA,
  TestEventBus,
  initTestLogger,
} from "../../../helpers"
import { GARDEN_CORE_ROOT } from "../../../../src/constants"
import { join, resolve } from "path"
import { Command, CommandGroup, CommandParams, PrepareParams } from "../../../../src/commands/base"
import { getPackageVersion } from "../../../../src/util/util"
import { UtilCommand } from "../../../../src/commands/util/util"
import { StringParameter } from "../../../../src/cli/params"
import stripAnsi from "strip-ansi"
import { ToolsCommand } from "../../../../src/commands/tools"
import { envSupportsEmoji, Logger, getLogger } from "../../../../src/logger/logger"
import { safeLoad } from "js-yaml"
import { GardenProcess } from "../../../../src/db/entities/garden-process"
import { ensureConnected } from "../../../../src/db/connection"
import { startServer, GardenServer } from "../../../../src/server/server"
import { FancyTerminalWriter } from "../../../../src/logger/writers/fancy-terminal-writer"
import { BasicTerminalWriter } from "../../../../src/logger/writers/basic-terminal-writer"

describe("cli", () => {
  before(async () => {
    await ensureConnected()
  })

  describe("run", () => {
    it("aborts with help text if no positional argument is provided", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: [], exitOnError: false })

      expect(code).to.equal(1)
      expect(consoleOutput).to.equal(cli.renderHelp())
    })

    it("aborts with default help text if -h option is set and no command", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: ["-h"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(cli.renderHelp())
    })

    it("aborts with default help text if --help option is set and no command", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: ["-h"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(cli.renderHelp())
    })

    it("aborts with command help text if --help option is set and command is specified", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({ args }) {
          return { result: { args } }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, consoleOutput } = await cli.run({ args: ["test-command", "--help"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(cmd.renderHelp())
    })

    it("aborts with version text if -v is set", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: ["-v"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(getPackageVersion())
    })

    it("aborts with version text if --version is set", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: ["--version"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(getPackageVersion())
    })

    it("aborts with version text if version is first argument", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: ["version"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(getPackageVersion())
    })

    context("test logger initialization", () => {
      // Logger is a singleton and we need to reset it between these tests as we're testing
      // that it's initialised correctly in this block.
      beforeEach(() => {
        Logger.clearInstance()
      })
      // Re-initialise the test logger
      after(() => {
        Logger.clearInstance()
        initTestLogger()
      })
      it("uses the fancy logger by default", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          noProject = true

          async action({}) {
            return { result: { something: "important" } }
          }
        }

        const cli = new GardenCli()
        const cmd = new TestCommand()
        cli.addCommand(cmd)

        await cli.run({ args: ["test-command"], exitOnError: false })

        const logger = getLogger()
        expect(logger.writers[0]).to.be.instanceOf(FancyTerminalWriter)
      })
      it("uses the basic logger if log level > info", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          noProject = true

          async action({}) {
            return { result: { something: "important" } }
          }
        }

        const cli = new GardenCli()
        const cmd = new TestCommand()
        cli.addCommand(cmd)

        await cli.run({
          args: ["--logger-type=fancy", "--log-level=3", "test-command"],
          exitOnError: false,
        })

        const logger = getLogger()
        expect(logger.writers[0]).to.be.instanceOf(BasicTerminalWriter)
      })
      it("uses the basic logger if --show-timestamps flag is set to true", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          noProject = true

          async action({}) {
            return { result: { something: "important" } }
          }
        }

        const cli = new GardenCli()
        const cmd = new TestCommand()
        cli.addCommand(cmd)

        await cli.run({ args: ["--logger-type=fancy", "--show-timestamps", "test-command"], exitOnError: false })

        const logger = getLogger()
        expect(logger.writers[0]).to.be.instanceOf(BasicTerminalWriter)
      })
    })
    it("shows group help text if specified command is a group", async () => {
      const cli = new GardenCli()
      const cmd = new UtilCommand()
      const { code, consoleOutput } = await cli.run({ args: ["util"], exitOnError: false })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(cmd.renderHelp())
    })

    it("picks and runs a command", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({}) {
          return { result: { something: "important" } }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({ args: ["test-command"], exitOnError: false })

      expect(code).to.equal(0)
      expect(result).to.eql({ something: "important" })
    })

    it("handles params specified before the command", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({}) {
          return { result: { something: "important" } }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({ args: ["--logger-type=basic", "test-command"], exitOnError: false })

      expect(code).to.equal(0)
      expect(result).to.eql({ something: "important" })
    })

    it("updates the GardenProcess entry if given with command info before running (no server)", async () => {
      const args = ["test-command", "--root", projectRootA]
      const record = await GardenProcess.register(args)

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        async action({ garden }: CommandParams) {
          expect(record.command).to.equal(this.name)
          expect(record.sessionId).to.equal(garden.sessionId)
          expect(record.persistent).to.equal(false)
          expect(record.serverHost).to.equal(null)
          expect(record.serverAuthKey).to.equal(null)
          expect(record.projectRoot).to.equal(garden.projectRoot)
          expect(record.projectName).to.equal(garden.projectName)
          expect(record.environmentName).to.equal(garden.environmentName)
          expect(record.namespace).to.equal(garden.namespace)

          return { result: {} }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      try {
        await cli.run({ args, exitOnError: false, processRecord: record })
      } finally {
        await record.remove()
      }
    })

    it("updates the GardenProcess entry if given with command info before running (with server)", async () => {
      const args = ["test-command", "--root", projectRootA]
      const record = await GardenProcess.register(args)

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        async prepare({ footerLog }: PrepareParams) {
          this.server = await startServer({ log: footerLog })
          return { persistent: true }
        }

        async action({ garden }: CommandParams) {
          expect(record.command).to.equal(this.name)
          expect(record.sessionId).to.equal(garden.sessionId)
          expect(record.persistent).to.equal(true)
          expect(record.serverHost).to.equal(this.server!.getUrl())
          expect(record.serverAuthKey).to.equal(this.server!.authKey)
          expect(record.projectRoot).to.equal(garden.projectRoot)
          expect(record.projectName).to.equal(garden.projectName)
          expect(record.environmentName).to.equal(garden.environmentName)
          expect(record.namespace).to.equal(garden.namespace)

          return { result: {} }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      try {
        await cli.run({ args, exitOnError: false, processRecord: record })
      } finally {
        await record.remove()
      }
    })

    it("connects the process to an external dashboard instance if available", async () => {
      // Spin up test server and register.
      // Note: We're using test-project-a and the default env+namespace both here and in the CLI run
      const serverGarden = await makeTestGardenA()
      const serverEventBus = new TestEventBus()
      const server = new GardenServer({ log: serverGarden.log })
      server["incomingEvents"] = serverEventBus
      await server.start()
      server.setGarden(serverGarden)

      const record = await GardenProcess.register(["dashboard"])
      await record.setCommand({
        command: "dashboard",
        sessionId: serverGarden.sessionId,
        persistent: true,
        serverHost: server.getUrl(),
        serverAuthKey: server.authKey,
        projectRoot: serverGarden.projectRoot,
        projectName: serverGarden.projectName,
        environmentName: serverGarden.environmentName,
        namespace: serverGarden.namespace,
      })

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        streamEvents = true
        streamLogEntries = true

        async action({ garden }: CommandParams) {
          garden.events.emit("_test", "funky functional test")
          return { result: {} }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const args = ["test-command", "--root", projectRootA]

      try {
        await cli.run({ args, exitOnError: false })
      } finally {
        await record.remove()
        await server.close()
      }

      serverEventBus.expectEvent("_test", "funky functional test")
    })

    it("tells the DashboardEventStream to ignore the local server URL", async () => {
      const testEventBus = new TestEventBus()

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        async prepare({ footerLog }: PrepareParams) {
          this.server = await startServer({ log: footerLog })
          this.server["incomingEvents"] = testEventBus
          return { persistent: true }
        }

        async action({ garden }: CommandParams) {
          garden.events.emit("_test", "nope")
          return { result: {} }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const args = ["test-command", "--root", projectRootA]

      await cli.run({ args, exitOnError: false })

      expect(testEventBus.eventLog).to.eql([])
    })

    it("shows the URL of local server if no external dashboard is found", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        async prepare({ footerLog }: PrepareParams) {
          this.server = await startServer({ log: footerLog })
          return { persistent: true }
        }

        async action({}: CommandParams) {
          return { result: {} }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const args = ["test-command", "--root", projectRootA]

      await cli.run({ args, exitOnError: false })

      const serverStatus = cmd.server!["statusLog"].getMessageState().msg!
      expect(stripAnsi(serverStatus)).to.equal(`Garden dashboard running at ${cmd.server!.getUrl()}`)
    })

    it("shows the URL of an external dashboard if applicable, instead of the built-in server URL", async () => {
      // Spin up test server and register.
      // Note: We're using test-project-a and the default env+namespace both here and in the CLI run
      const serverGarden = await makeTestGardenA()
      const serverEventBus = new TestEventBus()
      const server = new GardenServer({ log: serverGarden.log })
      server["incomingEvents"] = serverEventBus
      await server.start()
      server.setGarden(serverGarden)

      const record = await GardenProcess.register(["dashboard"])
      await record.setCommand({
        command: "dashboard",
        sessionId: serverGarden.sessionId,
        persistent: true,
        serverHost: server.getUrl(),
        serverAuthKey: server.authKey,
        projectRoot: serverGarden.projectRoot,
        projectName: serverGarden.projectName,
        environmentName: serverGarden.environmentName,
        namespace: serverGarden.namespace,
      })

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        async prepare({ footerLog }: PrepareParams) {
          this.server = await startServer({ log: footerLog })
          return { persistent: true }
        }

        async action({}: CommandParams) {
          return { result: {} }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const args = ["test-command", "--root", projectRootA]

      try {
        await cli.run({ args, exitOnError: false })
      } finally {
        await record.remove()
        await server.close()
      }

      const serverStatus = cmd.server!["statusLog"].getMessageState().msg!
      expect(stripAnsi(serverStatus)).to.equal(`Garden dashboard running at ${server.getUrl()}`)
    })

    it("picks and runs a subcommand in a group", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({}) {
          return { result: { something: "important" } }
        }
      }
      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const cli = new GardenCli()
      const group = new TestGroup()

      for (const cmd of group.getSubCommands()) {
        cli.addCommand(cmd)
      }

      const { code, result } = await cli.run({ args: ["test-group", "test-command"], exitOnError: false })

      expect(code).to.equal(0)
      expect(result).to.eql({ something: "important" })
    })

    it("correctly parses and passes global options", async () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "some-alias"
        help = ""
        noProject = true

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({
        args: [
          "test-command",
          "--root",
          "..",
          "--silent",
          "--env=default",
          "--logger-type",
          "basic",
          "-l=4",
          "--output",
          "json",
          "--yes",
          "--emoji=false",
          "--show-timestamps=false",
          "--force-refresh",
          "--var",
          "my=value,other=something",
        ],
        exitOnError: false,
      })

      expect(code).to.equal(0)
      expect(result).to.eql({
        args: { _: [] },
        opts: {
          "root": resolve(process.cwd(), ".."),
          "silent": true,
          "env": "default",
          "logger-type": "basic",
          "log-level": "4",
          "output": "json",
          "emoji": false,
          "show-timestamps": false,
          "yes": true,
          "force-refresh": true,
          "var": ["my=value", "other=something"],
          "version": false,
          "help": false,
        },
      })
    })

    it("correctly parses and passes arguments and options for a command", async () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "some-alias"
        help = ""
        noProject = true

        arguments = {
          foo: new StringParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringParameter({
            help: "Another help text.",
          }),
        }

        options = {
          floop: new StringParameter({
            help: "Option help text.",
          }),
        }

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({
        args: ["test-command", "foo-arg", "bar-arg", "--floop", "floop-opt"],
        exitOnError: false,
      })

      expect(code).to.equal(0)
      expect(result).to.eql({
        args: { _: [], foo: "foo-arg", bar: "bar-arg" },
        opts: {
          "root": process.cwd(),
          "silent": false,
          "env": undefined,
          "logger-type": undefined,
          "log-level": "info",
          "output": undefined,
          "emoji": envSupportsEmoji(),
          "show-timestamps": false,
          "yes": false,
          "force-refresh": false,
          "var": undefined,
          "version": false,
          "help": false,
          "floop": "floop-opt",
        },
      })
    })

    it("correctly parses and passes arguments and options for a subcommand", async () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "some-alias"
        help = ""
        noProject = true

        arguments = {
          foo: new StringParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringParameter({
            help: "Another help text.",
          }),
        }

        options = {
          floop: new StringParameter({
            help: "Option help text.",
          }),
        }

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const cli = new GardenCli()
      const group = new TestGroup()

      for (const cmd of group.getSubCommands()) {
        cli.addCommand(cmd)
      }

      const { code, result } = await cli.run({
        args: ["test-group", "test-command", "foo-arg", "bar-arg", "--floop", "floop-opt"],
        exitOnError: false,
      })

      expect(code).to.equal(0)
      expect(result).to.eql({
        args: { _: [], foo: "foo-arg", bar: "bar-arg" },
        opts: {
          "root": process.cwd(),
          "silent": false,
          "env": undefined,
          "logger-type": undefined,
          "log-level": "info",
          "output": undefined,
          "emoji": envSupportsEmoji(),
          "show-timestamps": false,
          "yes": false,
          "force-refresh": false,
          "var": undefined,
          "version": false,
          "help": false,
          "floop": "floop-opt",
        },
      })
    })

    it("aborts with usage information on invalid global options", async () => {
      const cli = new GardenCli()
      const cmd = new ToolsCommand()
      const { code, consoleOutput } = await cli.run({ args: ["tools", "--logger-type", "bla"], exitOnError: false })

      const stripped = stripAnsi(consoleOutput!).trim()

      expect(code).to.equal(1)
      expect(
        stripped.startsWith(
          'Invalid value for option --logger-type: "bla" is not a valid argument (should be any of "quiet", "basic", "fancy", "fullscreen", "json")'
        )
      ).to.be.true
      expect(consoleOutput).to.include(cmd.renderHelp())
    })

    it("aborts with usage information on missing/invalid command arguments and options", async () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "some-alias"
        help = ""
        noProject = true

        arguments = {
          foo: new StringParameter({
            help: "Some help text.",
            required: true,
          }),
        }

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cli = new GardenCli()
      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, consoleOutput } = await cli.run({ args: ["test-command"], exitOnError: false })

      const stripped = stripAnsi(consoleOutput!).trim()

      expect(code).to.equal(1)
      expect(stripped.startsWith("Missing required argument foo")).to.be.true
      expect(consoleOutput).to.include(cmd.renderHelp())
    })

    it("should not parse args after -- and instead pass directly to commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({ args }) {
          return { result: { args } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command)

      const { result } = await cli.run({ args: ["test-command", "--", "-v", "--flag", "arg"], exitOnError: false })
      expect(result).to.eql({ args: { _: ["-v", "--flag", "arg"] } })
    })

    it("should correctly parse --var flag", async () => {
      class TestCommand extends Command {
        name = "test-command-var"
        help = "halp!"
        noProject = true

        async action({ garden }) {
          return { result: { variables: garden.variables } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command)

      const { result } = await cli.run({
        args: ["test-command-var", "--var", 'key-a=value-a,key-b="value with quotes"'],
        exitOnError: false,
      })
      expect(result).to.eql({ variables: { "key-a": "value-a", "key-b": "value with quotes" } })
    })

    it("should output JSON if --output=json", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action() {
          return { result: { some: "output" } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command)

      const { consoleOutput } = await cli.run({ args: ["test-command", "--output=json"], exitOnError: false })
      expect(JSON.parse(consoleOutput!)).to.eql({ result: { some: "output" }, success: true })
    })

    it("should output YAML if --output=json", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action() {
          return { result: { some: "output" } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command)

      const { consoleOutput } = await cli.run({ args: ["test-command", "--output=yaml"], exitOnError: false })
      expect(safeLoad(consoleOutput!)).to.eql({ result: { some: "output" }, success: true })
    })

    it(`should configure a dummy environment when command has noProject=true and --env is specified`, async () => {
      class TestCommand2 extends Command {
        name = "test-command-2"
        help = "halp!"
        noProject = true

        async action({ garden }) {
          return { result: { environmentName: garden.environmentName } }
        }
      }

      const command = new TestCommand2()
      const cli = new GardenCli()
      cli.addCommand(command)

      const { result, errors } = await cli.run({ args: ["test-command-2", "--env", "missing-env"], exitOnError: false })
      expect(errors).to.eql([])
      expect(result).to.eql({ environmentName: "missing-env" })
    })

    it("should error if an invalid --env parameter is passed", async () => {
      class TestCommand3 extends Command {
        name = "test-command-3"
        help = "halp!"
        noProject = true

        async action({ garden }) {
          return { result: { environmentName: garden.environmentName } }
        }
      }

      const command = new TestCommand3()
      const cli = new GardenCli()
      cli.addCommand(command)

      const { errors } = await cli.run({ args: ["test-command-3", "--env", "$.%"], exitOnError: false })

      expect(errors.length).to.equal(1)
      expect(stripAnsi(errors[0].message)).to.equal(
        "Invalid value for option --env: Invalid environment specified ($.%): must be a valid environment name or <namespace>.<environment>"
      )
    })

    context("test analytics", () => {
      const host = "https://api.segment.io"
      const scope = nock(host)
      let garden: TestGarden
      let resetAnalyticsConfig: Function

      before(async () => {
        garden = await makeTestGardenA()
        resetAnalyticsConfig = await enableAnalytics(garden)
      })

      after(async () => {
        await resetAnalyticsConfig()
        nock.cleanAll()
      })

      it("should wait for queued analytic events to flush", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "hilfe!"
          noProject = true

          async action({ args }) {
            return { result: { args } }
          }
        }

        const command = new TestCommand()
        const cli = new GardenCli()
        cli.addCommand(command)

        scope
          .post(`/v1/batch`, (body) => {
            const events = body.batch.map((event: any) => ({
              event: event.event,
              type: event.type,
              name: event.properties.name,
            }))
            return isEqual(events, [
              {
                event: "Run Command",
                type: "track",
                name: "test-command",
              },
            ])
          })
          .reply(200)
        await cli.run({ args: ["test-command"], exitOnError: false })

        expect(scope.done()).to.not.throw
      })
    })
  })

  describe("makeDummyGarden", () => {
    it("should initialise and resolve config graph in a directory with no project", async () => {
      const garden = await makeDummyGarden(join(GARDEN_CORE_ROOT, "tmp", "foobarbas"), {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })

    it("should correctly configure a dummy environment when a namespace is set", async () => {
      const garden = await makeDummyGarden(join(GARDEN_CORE_ROOT, "tmp", "foobarbas"), { environmentName: "test.foo" })
      expect(garden).to.be.ok
      expect(garden.environmentName).to.equal("foo")
    })

    it("should initialise and resolve config graph in a project with invalid config", async () => {
      const root = getDataDir("test-project-invalid-config")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })

    it("should initialise and resolve config graph in a project with template strings", async () => {
      const root = getDataDir("test-project-templated")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })
  })
})
