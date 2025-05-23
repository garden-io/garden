/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Command, CommandGroup } from "../../../../src/commands/base.js"
import { StringsParameter } from "../../../../src/cli/params.js"
import stripAnsi from "strip-ansi"
import { replaceInFile } from "replace-in-file"
import { join } from "path"
import dedent from "dedent"
import { BuildCommand } from "../../../../src/commands/build.js"
import { DevCommand } from "../../../../src/commands/dev.js"
import { ValidateCommand } from "../../../../src/commands/validate.js"
import { uuidv4 } from "../../../../src/util/random.js"
import { trimLineEnds, getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"

describe("Command", () => {
  describe("renderHelp", () => {
    it("renders the command help text", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""

        override arguments = {
          foo: new StringsParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringsParameter({
            help: "Another help text.",
          }),
        }

        override options = {
          floop: new StringsParameter({
            help: "Option help text.",
          }),
        }

        override printHeader() {}

        async action() {
          return {}
        }
      }

      const cmd = new TestCommand()

      expect(trimLineEnds(stripAnsi(cmd.renderHelp())).trim()).to.equal(dedent`
      USAGE
        garden test-command <foo> [bar] [options]

      ARGUMENTS
        [bar]  Another help text.
               [array:string]
        <foo>  Some help text.
               [array:string]

      OPTIONS
        --floop   Option help text.
                  [array:string]
      `)
    })
    it("returns an empty string for hidden commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        override hidden = true
        help = "Hi, how are you?"

        override arguments = {
          foo: new StringsParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringsParameter({
            help: "Another help text.",
          }),
        }

        override options = {
          floop: new StringsParameter({
            help: "Option help text.",
          }),
        }

        override printHeader() {}

        async action() {
          return {}
        }
      }

      const cmd = new TestCommand()

      expect(cmd.renderHelp()).to.equal("")
    })
  })

  describe("getPaths", () => {
    it("returns the command path if not part of a group", () => {
      class TestCommand extends Command {
        name = "test-command"
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      const cmd = new TestCommand()
      expect(cmd.getPaths()).to.eql([["test-command"]])
    })

    it("returns the command path and alias if set and not part of a group", () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      const cmd = new TestCommand()
      expect(cmd.getPaths()).to.eql([["test-command"], ["some-alias"]])
    })

    it("returns the full command path if part of a group", () => {
      class TestCommand extends Command {
        name = "test-command"
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const cmd = new TestCommand(new TestGroup())
      // FIXME: This is needs to be set "manually" for now to work around issues with cloning commands.
      cmd.parent = new TestGroup()
      expect(cmd.getPaths()).to.eql([["test-group", "test-command"]])
    })

    it("returns the full command path if part of a group that has an alias", () => {
      class TestCommand extends Command {
        name = "test-command"
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        override aliases = ["group-alias"]
        help = ""

        subCommands = [TestCommand]
      }

      const cmd = new TestCommand(new TestGroup())
      // FIXME: This is needs to be set "manually" for now to work around issues with cloning commands.
      cmd.parent = new TestGroup()
      expect(cmd.getPaths()).to.eql([
        ["test-group", "test-command"],
        ["group-alias", "test-command"],
      ])
    })

    it("returns the full command paths including command alias if part of a group", () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["command-alias"]
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const cmd = new TestCommand(new TestGroup())
      // FIXME: This is needs to be set "manually" for now to work around issues with cloning commands.
      cmd.parent = new TestGroup()
      expect(cmd.getPaths()).to.eql([
        ["test-group", "test-command"],
        ["test-group", "command-alias"],
      ])
    })

    it("returns all permutations with aliases if both command and group have an alias", () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["command-alias"]
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        override aliases = ["group-alias"]
        help = ""

        subCommands = [TestCommand]
      }

      const cmd = new TestCommand(new TestGroup())
      // FIXME: This is needs to be set "manually" for now to work around issues with cloning commands.
      cmd.parent = new TestGroup()
      expect(cmd.getPaths()).to.eql([
        ["test-group", "test-command"],
        ["test-group", "command-alias"],
        ["group-alias", "test-command"],
        ["group-alias", "command-alias"],
      ])
    })
  })

  describe("run", () => {
    // This applies e.g. when running a command on the dev command line.
    context("when called with a parentSessionId and a reload is needed after a config change", () => {
      const projectRoot = getDataDir("test-projects", "config-template-reloading")

      it("passes on changed configs and templates to the parent and subsequent child instances", async () => {
        const garden = await makeTestGarden(projectRoot)
        // Here, we're testing the config clearing logic, so we turn this behavior on (which is off by default for
        // TestGarden instances).
        garden.clearConfigsOnScan = true
        // `makeTestGarden` does some trickery to copy the project root into a temp directory and work from there
        // (which is nice, since it avoids the need for cleanup).
        // Therefore, we need to make our find & replace substitutions inside the temp dir here.
        const tmpRoot = garden.projectRoot
        const log = garden.log

        const devCmd = new DevCommand()
        const devCmdSessionId = uuidv4()

        const validateCmd = new ValidateCommand()
        const buildCmd = new BuildCommand()

        // We run this command to trigger the initial scan for configs
        await validateCmd.run({
          log,
          args: {},
          opts: withDefaultGlobalOpts({ resolve: undefined }),
          garden,
          sessionId: uuidv4(),
          parentSessionId: devCmdSessionId,
          parentCommand: devCmd,
        })

        await replaceInFile({
          files: join(tmpRoot, "templates.garden.yml"),
          from: new RegExp("echo-prefix"),
          to: "reloaded-prefix",
        })
        await replaceInFile({
          files: join(tmpRoot, "actions.garden.yml"),
          from: new RegExp("name: test"),
          to: "name: reloaded-name",
        })

        // The modification to `templates.garden.yml` above would normally trigger a `configChanged` event which would
        // result in this call, but we're doing it manually here to simplify the test setup.
        garden.needsReload(true)
        await validateCmd.run({
          log,
          args: {},
          opts: withDefaultGlobalOpts({ resolve: undefined }),
          garden,
          sessionId: uuidv4(),
          parentSessionId: devCmdSessionId,
          parentCommand: devCmd,
        })

        const { result } = await buildCmd.run({
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
          garden,
          sessionId: uuidv4(),
          parentSessionId: devCmdSessionId,
          parentCommand: devCmd,
        })

        // This means that when the config was rescanned during the second `validate` command run:
        // * The action, module and workflow configs and config templates were also set on the parent Garden instance
        //   when the first validate command run rescanned & added configs.
        //  * The build command run that came immediately after received updated config templates, and the appropriately
        //    re-generated action configs from the updated template.
        expect(result.build["foo-reloaded-name"].buildLog).to.eql("reloaded-prefix reloaded-name")
      })
    })
  })
})

describe("CommandGroup", () => {
  describe("getSubCommands", () => {
    it("recursively returns all sub-commands", async () => {
      class TestCommandA extends Command {
        name = "test-command-a"
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestSubgroupA extends CommandGroup {
        name = "test-group-a"
        help = ""

        subCommands = [TestCommandA]
      }

      class TestCommandB extends Command {
        name = "test-command-b"
        help = ""

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestSubgroupB extends CommandGroup {
        name = "test-group-b"
        help = ""

        subCommands = [TestCommandB]
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestSubgroupA, TestSubgroupB]
      }

      const group = new TestGroup()
      const commands = group.getSubCommands()
      const fullNames = commands.map((cmd) => cmd.getFullName()).sort()

      expect(commands.length).to.equal(2)
      expect(fullNames).to.eql(["test-group test-group-a test-command-a", "test-group test-group-b test-command-b"])
    })
  })

  describe("renderHelp", () => {
    it("renders the command help text", async () => {
      class TestCommand extends Command {
        name = "test-command"
        override aliases = ["command-alias"]
        help = "Some help text."

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestGroup extends CommandGroup {
        name = "test-group"
        help = ""

        subCommands = [TestCommand]
      }

      const cmd = new TestGroup()
      // FIXME: This is needs to be set "manually" for now to work around issues with cloning commands.

      expect(trimLineEnds(stripAnsi(cmd.renderHelp())).trim()).to.equal(dedent`
      USAGE
        garden test-group <command> [options]

      COMMANDS
        test-group test-command  Some help text.
      `)
    })
  })
})

describe("CommandGroup", () => {
  describe("renderHelp", () => {
    it("renders the command help text", async () => {
      class TestSubCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = "Hi, how are you?"

        override arguments = {
          foo: new StringsParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringsParameter({
            help: "Another help text.",
          }),
        }

        override options = {
          floop: new StringsParameter({
            help: "Option help text.",
          }),
        }

        override printHeader() {}

        async action() {
          return {}
        }
      }

      class TestCommandGroup extends CommandGroup {
        name = "test-command-group"
        subCommands = [TestSubCommand]
        help = "Hi, how are you?"
      }

      const cmdGroup = new TestCommandGroup()
      const helpTxt = stripAnsi(cmdGroup.renderHelp()).trim()

      expect(helpTxt).to.equal(dedent`
        USAGE
          garden test-command-group <command> [options]

        COMMANDS
          test-command-group test-command  Hi, how are you?
      `)
    })
    it("skips hidden commands", async () => {
      class TestSubCommand extends Command {
        name = "test-command"
        override aliases = ["some-alias"]
        help = ""

        async action() {
          return {}
        }
      }
      class HiddenTestSubCommand extends Command {
        name = "test-command-hidden"
        override aliases = ["some-alias"]
        override hidden = true
        help = "Hi, how are you?"

        async action() {
          return {}
        }
      }

      class TestCommandGroup extends CommandGroup {
        name = "test-command-group"
        subCommands = [HiddenTestSubCommand, TestSubCommand]
        help = "Hi, how are you?"
      }

      const cmdGroup = new TestCommandGroup()
      const helpTxt = stripAnsi(cmdGroup.renderHelp()).trim()

      expect(helpTxt).to.equal(dedent`
        USAGE
          garden test-command-group <command> [options]

        COMMANDS
          test-command-group test-command
      `)
    })
    it("returns an empty string if all sub commands are hidden", async () => {
      class HiddenTestSubCommandA extends Command {
        name = "test-command-hidden-a"
        override aliases = ["some-alias"]
        override hidden = true
        help = "Hi, how are you?"

        async action() {
          return {}
        }
      }
      class HiddenTestSubCommandB extends Command {
        name = "test-command-hidden-b"
        override aliases = ["some-alias"]
        override hidden = true
        help = "Hi, how are you?"

        async action() {
          return {}
        }
      }

      class TestCommandGroup extends CommandGroup {
        name = "test-command-group"
        subCommands = [HiddenTestSubCommandA, HiddenTestSubCommandB]
        help = "Hi, how are you?"
      }

      const cmdGroup = new TestCommandGroup()

      expect(cmdGroup.renderHelp()).to.equal("")
    })
  })
})
