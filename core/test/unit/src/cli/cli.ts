/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import * as td from "testdouble"

import type { GardenCli } from "../../../../src/cli/cli.js"
import { validateRuntimeRequirementsCached } from "../../../../src/cli/cli.js"
import { getDataDir, projectRootA, initTestLogger } from "../../../helpers.js"
import { gardenEnv, GARDEN_CORE_ROOT } from "../../../../src/constants.js"
import { join, resolve } from "path"
import type { CommandParams, CommandResult, PrepareParams } from "../../../../src/commands/base.js"
import { Command, CommandGroup } from "../../../../src/commands/base.js"
import { UtilCommand } from "../../../../src/commands/util/util.js"
import { StringParameter } from "../../../../src/cli/params.js"
import stripAnsi from "strip-ansi"
import { ToolsCommand } from "../../../../src/commands/tools.js"
import { getRootLogger, RootLogger } from "../../../../src/logger/logger.js"
import { load } from "js-yaml"
import { startServer } from "../../../../src/server/server.js"
import { envSupportsEmoji } from "../../../../src/logger/util.js"
import { captureStream, expectError, expectFuzzyMatch } from "../../../../src/util/testing.js"
import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import tmp from "tmp-promise"
import { CloudCommand } from "../../../../src/commands/cloud/cloud.js"
import { registerProcess } from "../../../../src/process.js"
import { ServeCommand } from "../../../../src/commands/serve.js"
import { GardenInstanceManager } from "../../../../src/server/instance-manager.js"
import fsExtra from "fs-extra"

const { mkdirp } = fsExtra
import { uuidv4 } from "../../../../src/util/random.js"
import type { Garden } from "../../../../src/garden.js"
import { makeDummyGarden } from "../../../../src/garden.js"
import { TestGardenCli } from "../../../helpers/cli.js"
import { RuntimeError } from "../../../../src/exceptions.js"
import dedent from "dedent"
import { deepResolveContext } from "../../../../src/config/template-contexts/base.js"

/**
 * Helper functions for removing/resetting the global logger config which is set when
 * the test runner is initialized.
 *
 * By default the logger is set to `quiet` during test runs to hide log output but this
 * can be used to explicitly test the logger config without the test config getting in the way.
 *
 * The `removeGlobalLoggerConfig` function should be used in a `before` hook and the
 * `resetGlobalLoggerConfig` function should be used in the corresponding `after` hook.
 */
function getLoggerConfigSetters() {
  const envLoggerType = process.env.GARDEN_LOGGER_TYPE
  const envLogLevel = process.env.GARDEN_LOG_LEVEL

  const removeGlobalLoggerConfig = () => {
    delete process.env.GARDEN_LOGGER_TYPE
    delete process.env.GARDEN_LOG_LEVEL
    gardenEnv.GARDEN_LOGGER_TYPE = ""
    gardenEnv.GARDEN_LOG_LEVEL = ""
    RootLogger.clearInstance()
  }

  const resetGlobalLoggerConfig = () => {
    process.env.GARDEN_LOGGER_TYPE = envLoggerType
    process.env.GARDEN_LOG_LEVEL = envLogLevel
    gardenEnv.GARDEN_LOGGER_TYPE = envLoggerType || ""
    gardenEnv.GARDEN_LOG_LEVEL = envLogLevel || ""
    RootLogger.clearInstance()
    initTestLogger()
  }

  return { removeGlobalLoggerConfig, resetGlobalLoggerConfig }
}

describe("cli", () => {
  let cli: GardenCli
  const globalConfigStore = new GlobalConfigStore()
  const log = getRootLogger().createLog()
  const sessionId = uuidv4()

  beforeEach(() => {
    cli = new TestGardenCli()
  })

  afterEach(async () => {
    if (cli.processRecord && cli.processRecord.pid) {
      await globalConfigStore.delete("activeProcesses", String(cli.processRecord.pid))
    }
  })

  describe("run", () => {
    it("aborts with help text if no positional argument is provided", async () => {
      const { code, consoleOutput } = await cli.run({ args: [] })

      expect(code).to.equal(1)
      expect(consoleOutput).to.equal(await cli.renderHelp(log, "/"))
    })

    it("aborts with default help text if -h option is set and no command", async () => {
      const { code, consoleOutput } = await cli.run({ args: ["-h"] })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(await cli.renderHelp(log, "/"))
    })

    it("aborts with default help text if --help option is set and no command", async () => {
      const { code, consoleOutput } = await cli.run({ args: ["-h"] })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(await cli.renderHelp(log, "/"))
    })

    it("aborts with command help text if --help option is set and command is specified", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ args }) {
          return { result: { args } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, consoleOutput } = await cli.run({ args: ["test-command", "--help"] })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(cmd.renderHelp())
    })

    it("throws if --root is set, pointing to a non-existent path", async () => {
      const path = "/tmp/hauweighaeighuawek"
      const { code, consoleOutput } = await cli.run({ args: ["--root", path] })

      expect(code).to.equal(1)
      expect(stripAnsi(consoleOutput!)).to.equal(`Could not find specified root path (${path})`)
    })

    context("custom commands", () => {
      const root = getDataDir("test-projects", "custom-commands")

      it("picks up all commands in project root", async () => {
        const commands = await cli["getCustomCommands"](log, root)

        expect(commands.map((c) => c.name).sort()).to.eql(["combo", "echo", "run-task", "script"])
      })

      it("runs a custom command", async () => {
        const res = await cli.run({ args: ["echo", "foo"], cwd: root })

        expect(res.code).to.equal(0)
      })

      it("warns and ignores custom command with same name as built-in command", async () => {
        const commands = await cli["getCustomCommands"](log, root)

        // The plugin(s) commands are defined in nope.garden.yml
        expect(commands.map((c) => c.name)).to.not.include("plugins")
      })

      it("warns if a custom command is provided with same name as alias for built-in command", async () => {
        const commands = await cli["getCustomCommands"](log, root)

        // The plugin(s) commands are defined in nope.garden.yml
        expect(commands.map((c) => c.name)).to.not.include("plugin")
      })

      it("doesn't pick up commands outside of project root", async () => {
        const commands = await cli["getCustomCommands"](log, root)

        // The nope command is defined in the `nope` directory in the test project.
        expect(commands.map((c) => c.name)).to.not.include("nope")
      })

      it("prints custom commands in help text", async () => {
        const helpText = stripAnsi(await cli.renderHelp(log, root))

        expect(helpText).to.include("CUSTOM COMMANDS")

        expect(helpText).to.include("combo     A complete example using most")
        expect(helpText).to.include("available features") // There's a line break

        expect(helpText).to.include("echo      Just echo a string")
        expect(helpText).to.include("run-task  Run the specified task")
      })

      it("prints help text for a custom command", async () => {
        const res = await cli.run({ args: ["combo", "--help"], cwd: root })

        const commands = await cli["getCustomCommands"](log, root)
        const command = commands.find((c) => c.name === "combo")!
        const helpText = command.renderHelp()

        expect(res.code).to.equal(0)
        expect(res.consoleOutput).to.equal(helpText)
      })

      it("errors if a Command resource is invalid", async () => {
        // cli.run should never throw – if it throws, it's a bug
        const res = await cli.run({
          args: ["echo", "foo"],
          cwd: getDataDir("test-projects", "custom-commands-invalid"),
        })
        expect(res.code).to.not.equal(0)
        expectFuzzyMatch(res.consoleOutput!, "Error validating custom Command 'invalid'")
      })

      it("exits with code from exec command if it fails", async () => {
        const res = await cli.run({ args: ["script", "exit 2"], cwd: root })

        expect(res.code).to.equal(2)
      })

      it("exits with code 1 if Garden command fails", async () => {
        const res = await cli.run({ args: ["run", "fail"], cwd: root })

        expect(res.code).to.equal(1)
      })
    })

    context("exit codes", () => {
      const cwd = getDataDir("test-project-a")

      context("garden binary", () => {
        it("garden exits with code 1 on no flags", async () => {
          const res = await cli.run({ args: [], cwd })

          expect(res.code).to.equal(1)
        })

        it("garden exits with code 0 on --help flag", async () => {
          const res = await cli.run({ args: ["--help"], cwd })

          expect(res.code).to.equal(0)
        })

        it("garden exits with code 1 on unrecognized flag", async () => {
          const res = await cli.run({ args: ["--i-am-groot"], cwd })

          expect(res.code).to.equal(1)
          // TODO: this requires more complicated chnages in the args parsing flow,
          //  let's do it in a separate PR
          // expect(stripAnsi(res.consoleOutput!).toLowerCase()).to.contain("unrecognized option flag")
        })
      })

      context("garden command without sub-commands", () => {
        it("garden exits with code 0 on recognized command", async () => {
          const res = await cli.run({ args: ["validate"], cwd })

          expect(res.code).to.equal(0)
        })

        it("garden exits with code 0 on recognized command with --help flag", async () => {
          const res = await cli.run({ args: ["validate", "--help"], cwd })

          expect(res.code).to.equal(0)
        })

        it("garden exits with code 1 on recognized command with unrecognized flag", async () => {
          const res = await cli.run({ args: ["validate", "--i-am-groot"], cwd })

          expect(res.code).to.equal(1)
          expect(stripAnsi(res.consoleOutput!).toLowerCase()).to.contain("unrecognized option flag")
        })

        it("garden exits with code 1 on unrecognized command", async () => {
          const res = await cli.run({ args: ["baby-groot"], cwd })

          expect(res.code).to.equal(1)
        })

        it("garden exits with code 1 on unrecognized command with --help flag", async () => {
          const res = await cli.run({ args: ["baby-groot", "--help"], cwd })

          expect(res.code).to.equal(1)
        })

        it("garden exits with code 1 on unrecognized command with unrecognized flag", async () => {
          const res = await cli.run({ args: ["baby-groot", "--i-am-groot"], cwd })

          expect(res.code).to.equal(1)
        })
      })

      // Command with sub-commands is always a recognized command, so here we test only flags.
      context("garden command with sub-commands", () => {
        it("garden exits with code 0 on incomplete sub-command with --help flag", async () => {
          const res = await cli.run({ args: ["get", "--help"], cwd })

          expect(res.code).to.equal(0)
        })

        it("garden exits with code 1 on incomplete sub-command with unrecognized flag", async () => {
          const res = await cli.run({ args: ["get", "--i-am-groot"], cwd })

          expect(res.code).to.equal(1)
        })
      })

      context("garden sub-command", () => {
        it("garden exits with code 0 on recognized sub-command", async () => {
          const res = await cli.run({ args: ["get", "actions"], cwd })

          expect(res.code).to.equal(0)
        })

        it("garden exits with code 0 on recognized sub-command with --help flag", async () => {
          const res = await cli.run({ args: ["get", "actions", "--help"], cwd })

          expect(res.code).to.equal(0)
        })

        it("garden exits with code 1 on recognized sub-command with unrecognized flag", async () => {
          const res = await cli.run({ args: ["get", "actions", "--i-am-groot"], cwd })

          expect(res.code).to.equal(1)
          expect(stripAnsi(res.consoleOutput!).toLowerCase()).to.contain("unrecognized option flag")
        })

        it("garden exits with code 1 on unrecognized sub-command", async () => {
          const res = await cli.run({ args: ["get", "baby-groot"], cwd })

          expect(res.code).to.equal(1)
        })

        it("garden exits with code 1 on unrecognized sub-command with --help flag", async () => {
          const res = await cli.run({ args: ["get", "baby-groot", "--help"], cwd })

          expect(res.code).to.equal(1)
        })

        it("garden exits with code 1 on unrecognized sub-command with unrecognized flag", async () => {
          const res = await cli.run({ args: ["get", "baby-groot", "--i-am-groot"], cwd })

          expect(res.code).to.equal(1)
        })
      })
    })

    context("test logger initialization", () => {
      const { removeGlobalLoggerConfig, resetGlobalLoggerConfig } = getLoggerConfigSetters()

      // Logger is a singleton and we need to reset it between these tests as we're testing
      // that it's initialised correctly in this block.
      beforeEach(() => {
        removeGlobalLoggerConfig()
      })
      // Re-initialise the test logger
      after(() => {
        resetGlobalLoggerConfig()
      })

      it("uses the 'TerminalWriter' by default", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          override noProject = true

          override printHeader() {}

          async action({}) {
            return { result: { something: "important" } }
          }
        }

        const cmd = new TestCommand()
        cli.addCommand(cmd)

        await cli.run({ args: ["test-command"] })

        const logger = getRootLogger()
        const writers = logger.getWriters()
        expect(writers.display.type).to.equal("default")
      })
    })

    it("shows group help text if specified command is a group", async () => {
      const cmd = new UtilCommand()
      const { code, consoleOutput } = await cli.run({ args: ["util"] })

      expect(code).to.equal(1)
      expect(consoleOutput).to.equal(cmd.renderHelp())
    })

    it("shows nested subcommand help text if provided subcommand is a group", async () => {
      const cmd = new CloudCommand()
      const secrets = new cmd.subCommands[0]()
      const { code, consoleOutput } = await cli.run({ args: ["cloud", "secrets"] })

      expect(code).to.equal(1)
      expect(consoleOutput).to.equal(secrets.renderHelp())
    })

    it("shows nested subcommand help text if requested", async () => {
      const cmd = new CloudCommand()
      const secrets = new cmd.subCommands[0]()
      const { code, consoleOutput } = await cli.run({ args: ["cloud", "secrets", "--help"] })

      expect(code).to.equal(0)
      expect(consoleOutput).to.equal(secrets.renderHelp())
    })

    it("errors and shows general help if nonexistent command is given", async () => {
      const { code, consoleOutput } = await cli.run({ args: ["nonexistent"] })

      expect(code).to.equal(1)
      expect(consoleOutput).to.equal(await cli.renderHelp(log, "/"))
    })

    it("errors and shows general help if nonexistent command is given with --help", async () => {
      const { code, consoleOutput } = await cli.run({ args: ["nonexistent", "--help"] })

      expect(code).to.equal(1)
      expect(consoleOutput).to.equal(await cli.renderHelp(log, "/"))
    })

    it("picks and runs a command", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({}) {
          return { result: { something: "important" } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({ args: ["test-command"] })

      expect(code).to.equal(0)
      expect(result).to.eql({ something: "important" })
    })

    it("handles params specified before the command", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({}) {
          return { result: { something: "important" } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({ args: ["test-command"] })

      expect(code).to.equal(0)
      expect(result).to.eql({ something: "important" })
    })

    it("updates the GardenProcess entry if given with command info before running (no server)", async () => {
      const args = ["test-command", "--root", projectRootA]
      const processRecord = await registerProcess(globalConfigStore, "test-command", args)

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        override printHeader() {}

        async action({ garden }: CommandParams) {
          const record = (await globalConfigStore.get("activeProcesses", String(processRecord.pid)))!
          expect(record).to.exist

          expect(record.command).to.equal(this.name)
          expect(record.sessionId).to.exist
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

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      try {
        const result = await cli.run({ args, processRecord })
        if (result.errors[0]) {
          throw result.errors[0]
        }
      } finally {
        await globalConfigStore.delete("activeProcesses", String(processRecord.pid))
      }
    })

    it("updates the GardenProcess entry if given with command info before running (with server)", async () => {
      const args = ["test-command", "--root", projectRootA]
      const processRecord = await registerProcess(globalConfigStore, "test-command", args)

      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"

        override maybePersistent() {
          return true
        }

        override async prepare({ log: _log }: PrepareParams) {
          const serveCommand = new ServeCommand()
          this.server = await startServer({
            log: _log,
            defaultProjectRoot: projectRootA,
            manager: GardenInstanceManager.getInstance({
              log,
              sessionId,
              serveCommand,
              plugins: [],
            }),
            serveCommand,
          })
        }

        override printHeader() {}

        async action({ garden }: CommandParams) {
          const record = (await globalConfigStore.get("activeProcesses", String(processRecord.pid)))!
          expect(record).to.exist

          expect(record.command).to.equal(this.name)
          expect(record.sessionId).to.exist
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

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      try {
        const result = await cli.run({ args, processRecord })
        if (result.errors[0]) {
          throw result.errors[0]
        }
      } finally {
        await globalConfigStore.delete("activeProcesses", String(processRecord.pid))
      }
    })

    it.skip("shows the URL of the Garden Cloud dashboard", async () => {
      throw "TODO-G2"
    })

    it("picks and runs a subcommand in a group", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({}) {
          return { result: { something: "important" } }
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const group = new TestGroup()

      for (const cmd of group.getSubCommands()) {
        cli.addCommand(cmd)
      }

      const { code, result } = await cli.run({ args: ["test-group", "test-command"] })

      expect(code).to.equal(0)
      expect(result).to.eql({ something: "important" })
    })

    it("correctly parses and passes global options", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""
        override noProject = true

        override printHeader() {}

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const _args = [
        "test-command",
        "--root",
        "..",
        "--silent",
        "--env=default",
        "-l=4",
        "--output",
        "json",
        "--yes",
        "--emoji=false",
        "--logger-type=json",
        "--show-timestamps=false",
        "--force-refresh",
        "--var",
        "my=value,other=something",
      ]

      const { code, result } = await cli.run({
        args: _args,
      })

      expect(code).to.equal(0)
      expect(result).to.eql({
        args: { "$all": _args.slice(1), "--": [] },
        opts: {
          "root": resolve(process.cwd(), ".."),
          "silent": true,
          "env": "default",
          "logger-type": "json",
          "offline": false,
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

    it("allows setting env through GARDEN_ENVIRONMENT env variable", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""
        override noProject = true

        override printHeader() {}

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const saveEnv = gardenEnv.GARDEN_ENVIRONMENT

      try {
        gardenEnv.GARDEN_ENVIRONMENT = "foo"

        const { code, result } = await cli.run({
          args: ["test-command"],
        })

        expect(code).to.equal(0)
        expect(result.opts.env).to.equal("foo")
      } finally {
        gardenEnv.GARDEN_ENVIRONMENT = saveEnv
      }
    })

    it("prefers --env over GARDEN_ENVIRONMENT env variable", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""
        override noProject = true

        override printHeader() {}

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const saveEnv = gardenEnv.GARDEN_ENVIRONMENT

      try {
        gardenEnv.GARDEN_ENVIRONMENT = "bar"

        const { code, result } = await cli.run({
          args: ["test-command", "--env", "foo"],
        })

        expect(code).to.equal(0)
        expect(result.opts.env).to.equal("foo")
      } finally {
        gardenEnv.GARDEN_ENVIRONMENT = saveEnv
      }
    })

    it("correctly parses and passes arguments and options for a command", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""
        override noProject = true

        override arguments = {
          foo: new StringParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringParameter({
            help: "Another help text.",
          }),
        }

        override options = {
          floop: new StringParameter({
            help: "Option help text.",
          }),
        }

        override printHeader() {}

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, result } = await cli.run({
        args: ["test-command", "foo-arg", "bar-arg", "--floop", "floop-opt", "--", "extra"],
      })

      expect(code).to.equal(0)
      expect(result).to.eql({
        args: {
          "$all": ["foo-arg", "bar-arg", "--floop", "floop-opt", "--", "extra"],
          "--": ["extra"],
          "foo": "foo-arg",
          "bar": "bar-arg",
        },
        opts: {
          "silent": false,
          "log-level": "info",
          "emoji": envSupportsEmoji(),
          "show-timestamps": false,
          "yes": false,
          "force-refresh": false,
          "version": false,
          "help": false,
          "floop": "floop-opt",
          "env": undefined,
          "logger-type": undefined,
          "offline": false,
          "output": undefined,
          "root": undefined,
          "var": undefined,
        },
      })
    })

    it("correctly parses and passes arguments and options for a subcommand", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""
        override noProject = true

        override arguments = {
          foo: new StringParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringParameter({
            help: "Another help text.",
          }),
        }

        override options = {
          floop: new StringParameter({
            help: "Option help text.",
          }),
        }

        override printHeader() {}

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const group = new TestGroup()

      for (const cmd of group.getSubCommands()) {
        cli.addCommand(cmd)
      }

      const { code, result } = await cli.run({
        args: ["test-group", "test-command", "foo-arg", "bar-arg", "--floop", "floop-opt"],
      })

      expect(code).to.equal(0)
      expect(result).to.eql({
        args: {
          "$all": ["foo-arg", "bar-arg", "--floop", "floop-opt"],
          "--": [],
          "foo": "foo-arg",
          "bar": "bar-arg",
        },
        opts: {
          "silent": false,
          "log-level": "info",
          "emoji": envSupportsEmoji(),
          "show-timestamps": false,
          "yes": false,
          "force-refresh": false,
          "version": false,
          "help": false,
          "floop": "floop-opt",
          "env": undefined,
          "logger-type": undefined,
          "offline": false,
          "output": undefined,
          "root": undefined,
          "var": undefined,
        },
      })
    })

    it("aborts with usage information on invalid global options", async () => {
      const cmd = new ToolsCommand()
      const { code, consoleOutput } = await cli.run({ args: ["tools", "--logger-type", "bla"] })

      const stripped = stripAnsi(consoleOutput!).trim()

      expect(code).to.equal(1)
      expect(stripped).to.contain(
        'Invalid value for option --logger-type: "bla" is not a valid argument (should be any of '
      )
      expect(consoleOutput).to.include(cmd.renderHelp())
    })

    it("aborts with usage information on missing/invalid command arguments and options", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""
        override noProject = true

        override arguments = {
          foo: new StringParameter({
            help: "Some help text.",
            required: true,
          }),
        }

        override printHeader() {}

        async action({ args, opts }) {
          return { result: { args, opts } }
        }
      }

      const cmd = new TestCommand()
      cli.addCommand(cmd)

      const { code, consoleOutput } = await cli.run({ args: ["test-command"] })

      const stripped = stripAnsi(consoleOutput!).trim()

      expect(code).to.equal(1)
      expect(stripped).to.include("Missing required argument foo")
      expect(consoleOutput).to.include(cmd.renderHelp())
    })

    it("should pass array of all arguments to commands as $all", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ args }) {
          return { result: { args } }
        }
      }

      const command = new TestCommand()
      cli.addCommand(command)

      const { result } = await cli.run({ args: ["test-command", "--", "-v", "--flag", "arg"] })
      expect(result.args.$all).to.eql(["--", "-v", "--flag", "arg"])
    })

    it("should not parse args after -- and instead pass directly to commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ args }) {
          return { result: { args } }
        }
      }

      const command = new TestCommand()
      cli.addCommand(command)

      const { result } = await cli.run({ args: ["test-command", "--", "-v", "--flag", "arg"] })
      expect(result.args["--"]).to.eql(["-v", "--flag", "arg"])
    })

    it("should correctly parse --var flag", async () => {
      class TestCommand extends Command {
        name = "test-command-var"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ garden }: { garden: Garden }) {
          return { result: { variables: deepResolveContext("project variables", garden.variables) } }
        }
      }

      const command = new TestCommand()
      cli.addCommand(command)

      const { result } = await cli.run({
        args: ["test-command-var", "--var", 'key-a=value-a,key-b="value with quotes",key-c.key-d=nested-value'],
      })
      expect(result).to.eql({
        variables: { "key-a": "value-a", "key-b": "value with quotes", "key-c": { "key-d": "nested-value" } },
      })
    })

    it("should output JSON if --output=json", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action() {
          return { result: { some: "output" } }
        }
      }

      const command = new TestCommand()
      cli.addCommand(command)

      const { consoleOutput } = await cli.run({ args: ["test-command", "--output=json"] })
      expect(JSON.parse(consoleOutput!)).to.eql({ result: { some: "output" }, success: true })
    })

    it("should output YAML if --output=yaml", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action() {
          return { result: { some: "output" } }
        }
      }

      const command = new TestCommand()
      cli.addCommand(command)

      const { consoleOutput } = await cli.run({ args: ["test-command", "--output=yaml"] })
      expect(load(consoleOutput!)).to.eql({ result: { some: "output" }, success: true })
    })

    it(`should configure a dummy environment when command has noProject=true and --env is specified`, async () => {
      class TestCommand2 extends Command {
        name = "test-command-2"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ garden }) {
          return { result: { environmentName: garden.environmentName } }
        }
      }

      const command = new TestCommand2()
      cli.addCommand(command)

      const { result, errors } = await cli.run({ args: ["test-command-2", "--env", "missing-env"] })
      expect(errors).to.eql([])
      expect(result).to.eql({ environmentName: "missing-env" })
    })

    it("should error if an invalid --env parameter is passed", async () => {
      class TestCommand3 extends Command {
        name = "test-command-3"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ garden }) {
          return { result: { environmentName: garden.environmentName } }
        }
      }

      const command = new TestCommand3()
      cli.addCommand(command)

      const { errors } = await cli.run({ args: ["test-command-3", "--env", "$.%"] })

      expect(errors.length).to.equal(1)
      expect(stripAnsi(errors[0].message)).to.equal(
        "Invalid value for option --env: Invalid environment specified ($.%): must be a valid environment name or <namespace>.<environment>"
      )
    })

    describe("Command error handling", async () => {
      let hook: ReturnType<typeof captureStream>
      const { removeGlobalLoggerConfig, resetGlobalLoggerConfig } = getLoggerConfigSetters()

      beforeEach(() => {
        removeGlobalLoggerConfig()
        hook = captureStream(process.stdout)
      })
      afterEach(() => {
        resetGlobalLoggerConfig()
        hook.unhook()
      })
      it("handles GardenError on the command level correctly", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          override noProject = true

          override printHeader() {}

          async action({}): Promise<CommandResult> {
            throw new RuntimeError({ message: "Error message" })
          }
        }

        const cmd = new TestCommand()
        cli.addCommand(cmd)

        const { code } = await cli.run({ args: ["test-command"] })

        const output = stripAnsi(hook.captured())
        expect(code).to.equal(1)
        expect(output).to.eql(dedent`
          Error message

          See .garden/error.log for detailed error message\n`)
      })

      it("handles crash on the command level correctly", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          override noProject = true

          override printHeader() {}

          async action({}): Promise<CommandResult> {
            throw new TypeError("Cannot read property foo of undefined.")
          }
        }

        const cmd = new TestCommand()
        cli.addCommand(cmd)

        const { code } = await cli.run({ args: ["test-command"] })

        expect(code).to.equal(1)
        const outputLines = stripAnsi(hook.captured()).split("\n")

        const firstEightLines = outputLines.slice(0, 7).join("\n")
        expect(firstEightLines).to.eql(dedent`
          Encountered an unexpected Garden error. This is likely a bug 🍂

          You can help by reporting this on GitHub: https://github.com/garden-io/garden/issues/new?labels=bug,crash&template=CRASH.md&title=Crash%3A%20TypeError%3A%20Cannot%20read%20property%20foo%20of%20undefined.

          Please attach the following information to the bug report after making sure that the error message does not contain sensitive information:

          TypeError: Cannot read property foo of undefined.
        `)

        const firstStackTraceLine = outputLines[7]
        expect(firstStackTraceLine).to.contain("at TestCommand.action (")

        const lastLine = outputLines[outputLines.length - 2] // the last line is empty due to trailing newline
        expect(lastLine).to.eql("See .garden/error.log for detailed error message")
      })

      it("Handles crash on the command level with --output=yaml correctly", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "halp!"
          override noProject = true

          override printHeader() {}

          async action({}): Promise<CommandResult> {
            const err = new Error("Some unexpected error that leads to a crash")
            // the stack makes this hard to compare below
            err.stack = "stack"
            throw err
          }
        }

        const cmd = new TestCommand()
        cli.addCommand(cmd)

        const { code, consoleOutput } = await cli.run({ args: ["test-command", "-o", "yaml"] })

        expect(code).to.equal(1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultData = load(consoleOutput!) as any
        expect(resultData).to.eql({
          success: false,
          errors: [
            {
              type: "crash",
              message: "Error: Some unexpected error that leads to a crash",
              stack: "stack",
            },
          ],
        })
      })
    })
  })

  describe("renderHelp", () => {
    it("should skip hidden commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        override noProject = true

        override printHeader() {}

        async action({ args }) {
          return { result: { args } }
        }
      }

      class HiddenTestCommand extends Command {
        name = "hidden-test-command"
        help = "halp!"
        override noProject = true
        override hidden = true

        override printHeader() {}

        async action({ args }) {
          return { result: { args } }
        }
      }

      const cmd = new TestCommand()
      const hiddenCmd = new HiddenTestCommand()
      cli.addCommand(cmd)
      cli.addCommand(hiddenCmd)

      const { code, consoleOutput } = await cli.run({ args: ["--help"] })

      expect(code).to.equal(0)
      expect(consoleOutput).to.include("test-command")
      expect(consoleOutput).to.not.include("hidden-test-command")
    })
  })

  describe("makeDummyGarden", () => {
    it("should initialise and resolve config graph in a directory with no project", async () => {
      const path = join(GARDEN_CORE_ROOT, "tmp", "foobarbas")
      await mkdirp(path)
      const garden = await makeDummyGarden(path, {
        commandInfo: { name: "foo", args: {}, opts: {} },
      })
      const dg = await garden.getConfigGraph({ log: garden.log, emit: false })
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })

    it("should correctly configure a dummy environment when a namespace is set", async () => {
      const path = join(GARDEN_CORE_ROOT, "tmp", "foobarbas")
      await mkdirp(path)
      const garden = await makeDummyGarden(path, {
        environmentString: "test.foo",
        commandInfo: { name: "foo", args: {}, opts: {} },
      })
      expect(garden).to.be.ok
      expect(garden.environmentName).to.equal("foo")
    })

    it("should initialise and resolve config graph in a project with invalid config", async () => {
      const root = getDataDir("test-project-invalid-config")
      const garden = await makeDummyGarden(root, { commandInfo: { name: "foo", args: {}, opts: {} } })
      const dg = await garden.getConfigGraph({ log: garden.log, emit: false })
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })

    it("should initialise and resolve config graph in a project with template strings", async () => {
      const root = getDataDir("test-project-templated")
      const garden = await makeDummyGarden(root, { commandInfo: { name: "foo", args: {}, opts: {} } })
      const dg = await garden.getConfigGraph({ log: garden.log, emit: false })
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })
  })

  describe("runtime dependency check", () => {
    describe("validateRuntimeRequirementsCached", () => {
      let config: GlobalConfigStore
      let tmpDir: tmp.DirectoryResult

      before(async () => {
        tmpDir = await tmp.dir({ unsafeCleanup: true })
        config = new GlobalConfigStore(tmpDir.path)
      })

      after(async () => {
        await tmpDir.cleanup()
      })

      afterEach(async () => {
        await config.clear()
      })

      it("should call requirementCheckFunction if requirementsCheck hasn't been populated", async () => {
        const requirementCheckFunction = td.func<() => Promise<void>>()
        await validateRuntimeRequirementsCached(log, config, requirementCheckFunction)

        expect(td.explain(requirementCheckFunction).callCount).to.equal(1)
      })

      it("should call requirementCheckFunction if requirementsCheck hasn't passed", async () => {
        await config.set("requirementsCheck", { passed: false })
        const requirementCheckFunction = td.func<() => Promise<void>>()
        await validateRuntimeRequirementsCached(log, config, requirementCheckFunction)

        expect(td.explain(requirementCheckFunction).callCount).to.equal(1)
      })

      it("should populate config if requirementCheckFunction passes", async () => {
        const requirementCheckFunction = td.func<() => Promise<void>>()
        await validateRuntimeRequirementsCached(log, config, requirementCheckFunction)

        const requirementsCheckConfig = await config.get("requirementsCheck")
        expect(requirementsCheckConfig.passed).to.equal(true)
      })

      it("should not call requirementCheckFunction if requirementsCheck has been passed", async () => {
        await config.set("requirementsCheck", { passed: true })
        const requirementCheckFunction = td.func<() => Promise<void>>()
        await validateRuntimeRequirementsCached(log, config, requirementCheckFunction)

        expect(td.explain(requirementCheckFunction).callCount).to.equal(0)
      })

      it("should throw if requirementCheckFunction throws", async () => {
        async function requirementCheckFunction() {
          throw new Error("broken")
        }

        await expectError(() => validateRuntimeRequirementsCached(log, config, requirementCheckFunction), {
          contains: "broken",
        })
      })
    })
  })
})
