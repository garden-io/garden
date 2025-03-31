/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { readFile } from "fs/promises"
import { optionsWithAliasValues, pickCommand, processCliArgs } from "../../../../src/cli/helpers.js"
import type { ParameterObject } from "../../../../src/cli/params.js"
import { StringParameter, StringsParameter } from "../../../../src/cli/params.js"
import { expectError } from "../../../helpers.js"
import { getPackageVersion } from "../../../../src/util/util.js"
import { GARDEN_CORE_ROOT } from "../../../../src/constants.js"
import { join } from "path"
import type { TestGarden } from "../../../helpers.js"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers.js"
import { DeployCommand } from "../../../../src/commands/deploy.js"
import { parseCliArgs } from "../../../../src/cli/helpers.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { DeleteDeployCommand } from "../../../../src/commands/delete.js"
import { GetOutputsCommand } from "../../../../src/commands/get/get-outputs.js"
import { TestCommand } from "../../../../src/commands/test.js"
import { RunCommand } from "../../../../src/commands/run.js"
import { PublishCommand } from "../../../../src/commands/publish.js"
import { BuildCommand } from "../../../../src/commands/build.js"
import { Command } from "../../../../src/commands/base.js"
import { LogsCommand } from "../../../../src/commands/logs.js"
import { getBuiltinCommands } from "../../../../src/commands/commands.js"
import type { DeepPrimitiveMap } from "../../../../src/config/common.js"
import { getLogLevelChoices, LogLevel, parseLogLevel } from "../../../../src/logger/logger.js"
import { ExecCommand } from "../../../../src/commands/exec.js"
import { GetRunResultCommand } from "../../../../src/commands/get/get-run-result.js"

const validLogLevels = getLogLevelChoices()

describe("getPackageVersion", () => {
  it("should return the version in package.json", async () => {
    const version = JSON.parse(await readFile(join(GARDEN_CORE_ROOT, "package.json"), "utf-8")).version
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
    await expectError(() => parseLogLevel("banana"), "parameter")
  })
  it("should throw if level is not valid", async () => {
    await expectError(() => parseLogLevel("-1"), "parameter")
  })
  it("should throw if level is not valid", async () => {
    await expectError(() => parseLogLevel(""), "parameter")
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
    const { command, rest } = pickCommand(commands, ["workflow", "foo", "--force"])
    expect(command?.getPath()).to.eql(["workflow"])
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
    const argv = parseCliArgs({
      stringArgs: ["build", "my-module", "-f", "--with-dependants"],
      command: cmd,
      cli: true,
    })

    expect(argv.force).to.be.true
    expect(argv["with-dependants"]).to.be.true
  })

  it("sets empty string value instead of boolean for string options", () => {
    const cmd = new DeployCommand()
    const argv = parseCliArgs({ stringArgs: ["deploy", "--sync"], command: cmd, cli: true })

    expect(argv["sync"]).to.equal("")
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
    const cmd = new ExecCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: true })

    expect(argv.interactive).to.be.true
  })

  it("sets prefers defaultValue over cliDefault when cli=false", () => {
    const cmd = new ExecCommand()
    const argv = parseCliArgs({ stringArgs: [], command: cmd, cli: false })

    expect(argv.interactive).to.be.false
  })
})

function parseAndProcess<A extends ParameterObject, O extends ParameterObject>(
  args: string[],
  command: Command<A, O>,
  cli = true
) {
  const rawArgs = [...command.getPath(), ...args]
  return processCliArgs({ rawArgs, parsedArgs: parseCliArgs({ stringArgs: args, command, cli }), command, cli })
}

describe("processCliArgs", () => {
  let garden: TestGarden
  let log: Log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let defaultActionParams: any

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    defaultActionParams = {
      garden,
      log,
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
    const { args } = parseAndProcess(["module-name", "--force"], cmd)
    expect(args.$all).to.eql(["module-name", "--force"])
  })

  it("populates the -- argument", () => {
    const cmd = new BuildCommand()
    const { args } = parseAndProcess(["module-name", "--", "foo", "bla"], cmd)
    expect(args["--"]).to.eql(["foo", "bla"])
  })

  it("correctly handles command option flags", () => {
    const cmd = new DeployCommand()
    const { opts } = parseAndProcess(["--force-build=true", "--forward"], cmd)
    expect(opts["force-build"]).to.be.true
    expect(opts.forward).to.be.true
  })

  it("correctly handles option aliases", () => {
    const cmd = new DeployCommand()
    // The --sync option has two aliases: dev and dev-mode, so we test both of them.
    const { opts: firstOpts } = parseAndProcess(["--dev", "some-deploy", "--force-build=false"], cmd)
    const { opts: secondOpts } = parseAndProcess(["--dev-mode", "some-deploy"], cmd)
    expect(firstOpts["sync"]).to.eql(["some-deploy"])
    expect(firstOpts["force-build"]).to.be.false
    expect(secondOpts["sync"]).to.eql(["some-deploy"])
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
    const { opts } = parseAndProcess(["--logger-type", "json", "--log-level", "debug"], cmd)
    expect(opts["logger-type"]).to.equal("json")
    expect(opts["log-level"]).to.equal("debug")
  })

  it("throws an error when a required positional argument is missing", () => {
    const cmd = new ExecCommand()
    void expectError(() => parseAndProcess([], cmd), { contains: "Missing required argument" })
  })

  it("throws an error when an unexpected positional argument is given", () => {
    const cmd = new GetRunResultCommand()
    void expectError(() => parseAndProcess(["my-run", "bla"], cmd), {
      contains: 'Unexpected positional argument "bla"',
    })
  })

  it("throws an error when an unrecognized option is set", () => {
    const cmd = new BuildCommand()
    void expectError(() => parseAndProcess(["--foo=bar"], cmd), { contains: "Unrecognized option flag --foo" })
  })

  it("throws an error when an invalid argument is given to a choice option", () => {
    const cmd = new BuildCommand()
    void expectError(() => parseAndProcess(["--logger-type=foo"], cmd), {
      contains: 'Invalid value for option --logger-type: "foo" is not a valid argument (should be any of ',
    })
  })

  it("throws an error when an invalid argument is given to an integer option", () => {
    const cmd = new LogsCommand()
    void expectError(() => parseAndProcess(["--tail=foo"], cmd), {
      contains: 'Invalid value for option --tail: Could not parse "foo" as integer',
    })
  })

  it("ignores cliOnly options when cli=false", () => {
    const cmd = new ExecCommand()
    const { opts } = parseAndProcess(["my-service", "--", "echo 'test'", "--interactive=true"], cmd, false)
    expect(opts.interactive).to.be.false
  })

  it("sets default values for command flags", () => {
    const cmd = new BuildCommand()
    const { opts } = parseAndProcess([], cmd)
    expect(opts.force).to.be.false
  })

  it("sets default values for global flags", () => {
    const cmd = new BuildCommand()
    const { opts } = parseAndProcess([], cmd)
    expect(opts.silent).to.be.false
    expect(opts["log-level"]).to.equal(LogLevel[LogLevel.info])
  })

  it("prefers defaultValue value over cliDefault when cli=false", () => {
    const cmd = new ExecCommand()
    const { opts } = parseAndProcess(["my-service", "--", "echo 'test'"], cmd, false)
    expect(opts.interactive).to.be.false
  })

  it("prefers cliDefault value over defaultValue when cli=true", () => {
    const cmd = new ExecCommand()
    const { opts } = parseAndProcess(["my-service", "--", "echo 'test'"], cmd, true)
    expect(opts.interactive).to.be.true
  })

  it("throws with all found errors if applicable", () => {
    const cmd = new RunCommand()
    void expectError(() => parseAndProcess(["--foo=bar", "--interactive=9", "--force"], cmd), {
      contains: ["Unrecognized option flag --foo", "Unrecognized option flag --interactive"],
    })
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
    const { args, opts } = parseAndProcess(["module-b-unit", "--module", "module-b"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a RunCommand", async () => {
    const cmd = new RunCommand()
    const { args, opts } = parseAndProcess(["task-b"], cmd)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a RunCommand", async () => {
    const cmd = new RunCommand()
    const { args, opts } = parseAndProcess(["*", "--force"], cmd)
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

  context("spread args", () => {
    const argSpec = {
      first: new StringParameter({
        help: "Some help text.",
      }),
      spread: new StringsParameter({
        help: "Some help text.",
        spread: true,
      }),
    }

    class SpreadCommand extends Command<typeof argSpec> {
      name = "spread-command"
      help = "halp!"
      override noProject = true

      override arguments = argSpec

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async action(params: any) {
        return { result: params }
      }
    }

    it("should handle a spread argument spec", async () => {
      const cmd = new SpreadCommand()
      const { args } = parseAndProcess(["something", "a", "b", "c"], cmd)

      expect(args.first).to.equal("something")
      expect(args.spread).to.eql(["a", "b", "c"])
    })

    it("should handle a spread argument spec with comma-based values entered", async () => {
      const cmd = new SpreadCommand()
      const { args } = parseAndProcess(["something", "a,b,c"], cmd)

      expect(args.first).to.equal("something")
      expect(args.spread).to.eql(["a", "b", "c"])
    })
  })
})

describe("optionsWithAliasValues", () => {
  it("populates alias keys when option values are provided", async () => {
    const cmd = new DeployCommand()

    const { opts } = parseAndProcess(["service-a,service-b", "--sync=service-a,service-b"], cmd)
    const withAliasValues = optionsWithAliasValues(cmd, <DeepPrimitiveMap>opts)
    expect(withAliasValues["sync"]).to.eql(["service-a", "service-b"])
    expect(withAliasValues["dev"]).to.eql(["service-a", "service-b"]) // We expect the alias to be populated too
  })
})
