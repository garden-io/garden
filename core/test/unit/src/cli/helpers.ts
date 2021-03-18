/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { pickCommand, processCliArgs } from "../../../../src/cli/helpers"
import { Parameters } from "../../../../src/cli/params"
import { expectError } from "../../../helpers"
import { getPackageVersion } from "../../../../src/util/util"
import { GARDEN_CORE_ROOT } from "../../../../src/constants"
import { join } from "path"
import { TestGarden, makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"
import { DeployCommand } from "../../../../src/commands/deploy"
import { parseCliArgs } from "../../../../src/cli/helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { DeleteServiceCommand } from "../../../../src/commands/delete"
import { GetOutputsCommand } from "../../../../src/commands/get/get-outputs"
import { TestCommand } from "../../../../src/commands/test"
import { RunTaskCommand } from "../../../../src/commands/run/task"
import { RunTestCommand } from "../../../../src/commands/run/test"
import { PublishCommand } from "../../../../src/commands/publish"
import { BuildCommand } from "../../../../src/commands/build"
import { getLogLevelChoices, parseLogLevel } from "../../../../src/logger/logger"
import stripAnsi from "strip-ansi"
import { Command } from "../../../../src/commands/base"
import { dedent } from "../../../../src/util/string"
import { LogsCommand } from "../../../../src/commands/logs"
import { getAllCommands } from "../../../../src/commands/commands"

const validLogLevels = ["error", "warn", "info", "verbose", "debug", "silly", "0", "1", "2", "3", "4", "5"]

describe("getPackageVersion", () => {
  it("should return the version in package.json", async () => {
    const version = require(join(GARDEN_CORE_ROOT, "package.json")).version
    expect(getPackageVersion()).to.eq(version)
  })
})

describe("getLogLevelChoices", () => {
  it("should return all valid log levels as strings", async () => {
    const choices = getLogLevelChoices().sort()
    const sorted = [...validLogLevels].sort()
    expect(choices).to.eql(sorted)
  })
})

describe("parseLogLevel", () => {
  it("should return a level integer if valid", async () => {
    const parsed = validLogLevels.map((el) => parseLogLevel(el))
    expect(parsed).to.eql([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5])
  })
  it("should throw if level is not valid", async () => {
    await expectError(() => parseLogLevel("banana"), "internal")
  })
  it("should throw if level is not valid", async () => {
    await expectError(() => parseLogLevel("-1"), "internal")
  })
  it("should throw if level is not valid", async () => {
    await expectError(() => parseLogLevel(""), "internal")
  })
})

describe("pickCommand", () => {
  const commands = getAllCommands()

  it("picks a command and returns the rest of arguments", () => {
    const { command, rest } = pickCommand(commands, ["build", "foo", "--force"])
    expect(command?.getPath()).to.eql(["build"])
    expect(rest).to.eql(["foo", "--force"])
  })

  it("picks a subcommand and returns the rest of arguments", () => {
    const { command, rest } = pickCommand(commands, ["run", "workflow", "foo", "--force"])
    expect(command?.getPath()).to.eql(["run", "workflow"])
    expect(rest).to.eql(["foo", "--force"])
  })

  it("picks a command with an alias", () => {
    const { command, rest } = pickCommand(commands, ["del", "env", "foo", "--force"])
    expect(command?.getPath()).to.eql(["delete", "environment"])
    expect(rest).to.eql(["foo", "--force"])
  })

  it("returns undefined command if none is found", () => {
    const args = ["bla", "ble"]
    const { command, rest } = pickCommand(commands, args)
    expect(command).to.be.undefined
    expect(rest).to.eql(args)
  })
})

describe("parseCliArgs", () => {
  it("parses string arguments and returns a mapping", () => {
    const argv = parseCliArgs({ stringArgs: ["build", "my-module", "--force", "-l=5"], cli: true })

    expect(argv._).to.eql(["build", "my-module"])
    expect(argv.force).to.be.true
    expect(argv["log-level"]).to.equal("5")
  })

  it("returns an array for a parameter if multiple instances are specified", () => {
    const argv = parseCliArgs({ stringArgs: ["test", "--name", "foo", "--name", "bar"], cli: true })

    expect(argv._).to.eql(["test"])
    expect(argv.name).to.eql(["foo", "bar"])
  })

  it("correctly handles global boolean options", () => {
    const argv = parseCliArgs({
      stringArgs: ["build", "my-module", "--force-refresh", "--silent=false", "-y"],
      cli: true,
    })

    expect(argv["force-refresh"]).to.be.true
    expect(argv.silent).to.be.false
    expect(argv.yes).to.be.true
  })

  it("correctly handles command boolean options", () => {
    const cmd = new BuildCommand()
    const argv = parseCliArgs({ stringArgs: ["build", "my-module", "-f", "--watch"], command: cmd, cli: true })

    expect(argv.force).to.be.true
    expect(argv.watch).to.be.true
  })

  it("sets empty string value instead of boolean for string options", () => {
    const cmd = new DeployCommand()
    const argv = parseCliArgs({ stringArgs: ["deploy", "--hot"], command: cmd, cli: true })

    expect(argv["hot-reload"]).to.equal("")
  })

  it("sets default global option values", () => {
    const cmd = new DeployCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: true })

    expect(argv.silent).to.be.false
    expect(argv.root).to.equal(process.cwd())
  })

  it("sets default command option values", () => {
    const cmd = new BuildCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: true })

    expect(argv.force).to.be.false
    expect(argv.watch).to.be.false
  })

  it("sets prefers cliDefault over defaultValue when cli=true", () => {
    const cmd = new RunTestCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: true })

    expect(argv.interactive).to.be.true
  })

  it("sets prefers defaultValue over cliDefault when cli=false", () => {
    const cmd = new RunTestCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: false })

    expect(argv.interactive).to.be.false
  })
})

describe("processCliArgs", () => {
  let garden: TestGarden
  let log: LogEntry
  let defaultActionParams: any

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    defaultActionParams = {
      garden,
      log,
      headerLog: log,
      footerLog: log,
    }
  })

  function parseAndProcess<A extends Parameters, O extends Parameters>(
    args: string[],
    command: Command<A, O>,
    cli = true
  ) {
    return processCliArgs({ parsedArgs: parseCliArgs({ stringArgs: args, command, cli }), command, cli })
  }

  it("correctly handles blank arguments", () => {
    const cmd = new BuildCommand()
    const { args } = parseAndProcess([], cmd)
    expect(args._).to.eql([])
    expect(args.modules).to.be.undefined
  })

  it("correctly handles command option flags", () => {
    const cmd = new DeployCommand()
    const { opts } = parseAndProcess(["--force-build=true", "--watch"], cmd)
    expect(opts["force-build"]).to.be.true
    expect(opts.watch).to.be.true
  })

  it("correctly handles option aliases", () => {
    const cmd = new DeployCommand()
    const { opts } = parseAndProcess(["-w", "--force-build=false"], cmd)
    expect(opts.watch).to.be.true
    expect(opts["force-build"]).to.be.false
  })

  it("correctly handles multiple instances of a string array parameter", () => {
    const cmd = new TestCommand()
    const { opts } = parseAndProcess(["--name", "foo", "-n", "bar"], cmd)
    expect(opts.name).to.eql(["foo", "bar"])
  })

  it("correctly handles multiple instances of a string array parameter where one uses string-delimited values", () => {
    const cmd = new TestCommand()
    const { opts } = parseAndProcess(["--name", "foo,bar", "-n", "baz"], cmd)
    expect(opts.name).to.eql(["foo", "bar", "baz"])
  })

  // Note: If an option alias appears before the option (e.g. -w before --watch),
  // the option's value takes precedence over the alias' value (e.g. --watch=false
  // takes precedence over -w).
  it("uses value of last option when non-array option is repeated", () => {
    const cmd = new DeployCommand()
    const { opts } = parseAndProcess(["--force-build=false", "--force-build=true"], cmd)
    expect(opts["force-build"]).to.be.true
  })

  it("correctly handles positional arguments", () => {
    const cmd = new BuildCommand()
    const { args } = parseAndProcess(["my-module"], cmd)
    expect(args.modules).to.eql(["my-module"])
  })

  it("correctly handles global option flags", () => {
    const cmd = new BuildCommand()
    const { opts } = parseAndProcess(["--log-level", "debug", "--logger-type=basic"], cmd)
    expect(opts["logger-type"]).to.equal("basic")
    expect(opts["log-level"]).to.equal("debug")
  })

  // TODO: do this after the refactor is done and tested
  // it("should handle a variadic argument spec", async () => {
  //   const argSpec = {
  //     first: new StringParameter({
  //       help: "Some help text.",
  //     }),
  //     rest: new StringsParameter({
  //       help: "Some help text.",
  //       variadic: true,
  //     }),
  //   }

  //   class VarCommand extends Command<typeof argSpec> {
  //     name = "var-command"
  //     help = "halp!"
  //     noProject = true

  //     arguments = argSpec

  //     async action(params) {
  //       return { result: params }
  //     }
  //   }

  //   const cmd = new VarCommand()
  //   const { args } = parseAndProcess(["test-command", "something", "a", "b", "c"], cmd)

  //   expect(args.first).to.equal("something")
  //   expect(args.rest).to.eql(["a", "b", "c"])
  // })

  it("throws an error when a required positional argument is missing", () => {
    const cmd = new RunTaskCommand()
    expectError(
      () => parseAndProcess([], cmd),
      (err) => expect(stripAnsi(err.message)).to.equal("Missing required argument task")
    )
  })

  it("throws an error when an unexpected positional argument is given", () => {
    const cmd = new DeleteServiceCommand()
    expectError(
      () => parseAndProcess(["my-service", "bla"], cmd),
      (err) => expect(stripAnsi(err.message)).to.equal(`Unexpected positional argument "bla" (expected only services)`)
    )
  })

  it("throws an error when an unrecognized option is set", () => {
    const cmd = new BuildCommand()
    expectError(
      () => parseAndProcess(["--foo=bar"], cmd),
      (err) => expect(stripAnsi(err.message)).to.equal("Unrecognized option flag --foo")
    )
  })

  it("throws an error when an invalid argument is given to a choice option", () => {
    const cmd = new BuildCommand()
    expectError(
      () => parseAndProcess(["--logger-type=foo"], cmd),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          'Invalid value for option --logger-type: "foo" is not a valid argument (should be any of "quiet", "basic", "fancy", "fullscreen", "json")'
        )
    )
  })

  it("throws an error when an invalid argument is given to an integer option", () => {
    const cmd = new LogsCommand()
    expectError(
      () => parseAndProcess(["--tail=foo"], cmd),
      (err) =>
        expect(stripAnsi(err.message)).to.equal('Invalid value for option --tail: Could not parse "foo" as integer')
    )
  })

  it("ignores cliOnly options when cli=false", () => {
    const cmd = new RunTestCommand()
    const { opts } = parseAndProcess(["my-module", "my-test", "--interactive=true"], cmd, false)
    expect(opts.interactive).to.be.false
  })

  it("sets default values for command flags", () => {
    const cmd = new BuildCommand()
    const { opts } = parseAndProcess([], cmd)
    expect(opts.force).to.be.false
    expect(opts.watch).to.be.false
  })

  it("sets default values for global flags", () => {
    const cmd = new BuildCommand()
    const { opts } = parseAndProcess([], cmd)
    expect(opts.silent).to.be.false
    expect(opts.root).to.equal(process.cwd())
  })

  it("prefers defaultValue value over cliDefault when cli=false", () => {
    const cmd = new RunTestCommand()
    const { opts } = parseAndProcess(["my-module", "my-test"], cmd, false)
    expect(opts.interactive).to.be.false
  })

  it("prefers cliDefault value over defaultValue when cli=true", () => {
    const cmd = new RunTestCommand()
    const { opts } = parseAndProcess(["my-module", "my-test"], cmd, true)
    expect(opts.interactive).to.be.true
  })

  it("throws with all found errors if applicable", () => {
    const cmd = new RunTestCommand()
    expectError(
      () => parseAndProcess(["--foo=bar", "--interactive=9"], cmd),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
          Missing required argument module
          Missing required argument test
          Unrecognized option flag --foo
        `)
    )
  })

  it("parses args and opts for a DeployCommand", async () => {
    const cmd = new DeployCommand()

    const { args, opts } = parseAndProcess(["service-a,service-b", "--force-build=true"], cmd)

    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })

    const { args: args2, opts: opts2 } = parseAndProcess(["service-a", "--hot=service-a"], cmd)

    await cmd.action({
      ...defaultActionParams,
      args: args2,
      opts: withDefaultGlobalOpts(opts2),
    })
  })

  it("parses args and opts for a DeleteServiceCommand", async () => {
    const cmd = new DeleteServiceCommand()
    const { args, opts } = parseAndProcess(["service-a"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a GetOutputsCommand", async () => {
    const cmd = new GetOutputsCommand()
    const { args, opts } = parseAndProcess([], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a TestCommand", async () => {
    const cmd = new TestCommand()
    const { args, opts } = parseAndProcess(["module-a,module-b", "-n unit"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a RunTaskCommand", async () => {
    const cmd = new RunTaskCommand()
    const { args, opts } = parseAndProcess(["task-b"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a RunTestCommand", async () => {
    const cmd = new RunTestCommand()
    const { args, opts } = parseAndProcess(["module-b", "unit", "--interactive"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a PublishCommand", async () => {
    const cmd = new PublishCommand()
    const { args, opts } = parseAndProcess(["module-a,module-b", "--allow-dirty"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })
})
