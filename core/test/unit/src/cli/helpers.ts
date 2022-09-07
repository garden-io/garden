/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { optionsWithAliasValues, pickCommand, processCliArgs } from "../../../../src/cli/helpers"
import { Parameters } from "../../../../src/cli/params"
import { expectError, expectFuzzyMatch } from "../../../helpers"
import { getPackageVersion } from "../../../../src/util/util"
import { GARDEN_CORE_ROOT } from "../../../../src/constants"
import { join } from "path"
import { TestGarden, makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"
import { DeployCommand } from "../../../../src/commands/deploy"
import { parseCliArgs } from "../../../../src/cli/helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { DeleteDeployCommand } from "../../../../src/commands/delete"
import { GetOutputsCommand } from "../../../../src/commands/get/get-outputs"
import { TestCommand } from "../../../../src/commands/test"
import { RunTaskCommand } from "../../../../src/commands/run/run-task"
import { RunTestCommand } from "../../../../src/commands/run/run-test"
import { PublishCommand } from "../../../../src/commands/publish"
import { BuildCommand } from "../../../../src/commands/build"
import stripAnsi from "strip-ansi"
import { Command } from "../../../../src/commands/base"
import { dedent } from "../../../../src/util/string"
import { LogsCommand } from "../../../../src/commands/logs"
import { getBuiltinCommands } from "../../../../src/commands/commands"
import { DeepPrimitiveMap } from "../../../../src/config/common"
import { getLogLevelChoices, LogLevel, parseLogLevel } from "../../../../src/logger/logger"

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
  const commands = getBuiltinCommands()

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
    const { command, rest } = pickCommand(commands, ["delete", "ns", "foo", "--force"])
    expect(command?.getPath()).to.eql(["cleanup", "namespace"])
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
    const argv = parseCliArgs({ stringArgs: ["deploy", "--dev"], command: cmd, cli: true })

    expect(argv["dev-mode"]).to.equal("")
  })

  it("sets default global option values", () => {
    const cmd = new DeployCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: true })

    expect(argv.silent).to.be.false
    expect(argv["log-level"]).to.equal(LogLevel[LogLevel.info])
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

function parseAndProcess<A extends Parameters, O extends Parameters>(
  args: string[],
  command: Command<A, O>,
  cli = true
) {
  const rawArgs = [...command.getPath(), ...args]
  return processCliArgs({ rawArgs, parsedArgs: parseCliArgs({ stringArgs: args, command, cli }), command, cli })
}

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

  it("correctly handles blank arguments", () => {
    const cmd = new BuildCommand()
    const { args } = parseAndProcess([], cmd)
    expect(args.$all).to.eql([])
    expect(args["--"]).to.eql([])
    expect(args.names).to.be.undefined
  })

  it("populates the $all argument, omitting the command name", () => {
    const cmd = new BuildCommand()
    // Note: The command name is implicitly added in this helper
    const { args } = parseAndProcess(["module-name", "--watch"], cmd)
    expect(args.$all).to.eql(["module-name", "--watch"])
  })

  it("populates the -- argument", () => {
    const cmd = new BuildCommand()
    const { args } = parseAndProcess(["module-name", "--", "foo", "bla"], cmd)
    expect(args["--"]).to.eql(["foo", "bla"])
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
    expect(args.names).to.eql(["my-module"])
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
    expectError(() => parseAndProcess([], cmd), { contains: "Missing required argument" })
  })

  it("throws an error when an unexpected positional argument is given", () => {
    const cmd = new DeleteDeployCommand()
    expectError(() => parseAndProcess(["my-service", "bla"], cmd), { contains: 'Unexpected positional argument "bla"' })
  })

  it("throws an error when an unrecognized option is set", () => {
    const cmd = new BuildCommand()
    expectError(() => parseAndProcess(["--foo=bar"], cmd), { contains: "Unrecognized option flag --foo" })
  })

  it("throws an error when an invalid argument is given to a choice option", () => {
    const cmd = new BuildCommand()
    expectError(() => parseAndProcess(["--logger-type=foo"], cmd), {
      contains:
        'Invalid value for option --logger-type: "foo" is not a valid argument (should be any of "quiet", "basic", "fancy", "json")',
    })
  })

  it("throws an error when an invalid argument is given to an integer option", () => {
    const cmd = new LogsCommand()
    expectError(() => parseAndProcess(["--tail=foo"], cmd), {
      contains: 'Invalid value for option --tail: Could not parse "foo" as integer',
    })
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
    expect(opts["log-level"]).to.equal(LogLevel[LogLevel.info])
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
      (err) => {
        expectFuzzyMatch(err.message, "Missing required argument")
        expectFuzzyMatch(err.message, "Unrecognized option flag --foo")
      }
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

    const { args: args2, opts: opts2 } = parseAndProcess(["service-a", "--skip-dependencies=true"], cmd)

    await cmd.action({
      ...defaultActionParams,
      args: args2,
      opts: withDefaultGlobalOpts(opts2),
    })
  })

  it("parses args and opts for a DeleteServiceCommand", async () => {
    const cmd = new DeleteDeployCommand()
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
    const { args, opts } = parseAndProcess(["module-a,module-b", "--force-build"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })
})

describe("optionsWithAliasValues", () => {
  it("populates alias keys when option values are provided", async () => {
    const cmd = new DeployCommand()

    const { opts } = parseAndProcess(["service-a,service-b", "--dev=service-a,service-b"], cmd)
    const withAliasValues = optionsWithAliasValues(cmd, <DeepPrimitiveMap>opts)
    expect(withAliasValues["dev-mode"]).to.eql(["service-a", "service-b"])
    expect(withAliasValues["dev"]).to.eql(["service-a", "service-b"]) // We expect the alias to be populated too
  })
})
