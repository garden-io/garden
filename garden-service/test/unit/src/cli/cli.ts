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
import { getDataDir, TestGarden, makeTestGardenA, enableAnalytics } from "../../../helpers"
import { GARDEN_SERVICE_ROOT } from "../../../../src/constants"
import { join, resolve } from "path"
import { Command, CommandGroup } from "../../../../src/commands/base"
import { getPackageVersion } from "../../../../src/util/util"
import { UtilCommand } from "../../../../src/commands/util"
import { StringParameter } from "../../../../src/cli/params"
import stripAnsi from "strip-ansi"
import { ToolsCommand } from "../../../../src/commands/tools"
import { envSupportsEmoji } from "../../../../src/logger/logger"
import { safeLoad } from "js-yaml"

describe("cli", () => {
  describe("run", () => {
    it("aborts with help text if no positional argument is provided", async () => {
      const cli = new GardenCli()
      const { code, consoleOutput } = await cli.run({ args: [], exitOnError: false })

      expect(code).to.equal(0)
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
      const garden = await makeDummyGarden(join(GARDEN_SERVICE_ROOT, "tmp", "foobarbas"), {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with invalid config", async () => {
      const root = getDataDir("test-project-invalid-config")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
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
