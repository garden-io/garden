/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Command, CommandGroup } from "../../../../src/commands/base"
import { StringsParameter } from "../../../../src/cli/params"
import stripAnsi from "strip-ansi"
import { dedent } from "../../../../src/util/string"
import { trimLineEnds } from "../../../helpers"

describe("Command", () => {
  describe("renderHelp", () => {
    it("renders the command help text", async () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "some-alias"
        help = ""

        arguments = {
          foo: new StringsParameter({
            help: "Some help text.",
            required: true,
          }),
          bar: new StringsParameter({
            help: "Another help text.",
          }),
        }

        options = {
          floop: new StringsParameter({
            help: "Option help text.",
          }),
        }

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
  })

  describe("getPaths", () => {
    it("returns the command path if not part of a group", () => {
      class TestCommand extends Command {
        name = "test-command"
        help = ""

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
        alias = "some-alias"
        help = ""

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
      expect(cmd.getPaths()).to.eql([["test-group", "test-command"]])
    })

    it("returns the full command path if part of a group that has an alias", () => {
      class TestCommand extends Command {
        name = "test-command"
        help = ""

        async action() {
          return {}
        }
      }
      class TestGroup extends CommandGroup {
        name = "test-group"
        alias = "group-alias"
        help = ""

        subCommands = [TestCommand]
      }
      const cmd = new TestCommand(new TestGroup())
      expect(cmd.getPaths()).to.eql([
        ["test-group", "test-command"],
        ["group-alias", "test-command"],
      ])
    })

    it("returns the full command paths including command alias if part of a group", () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "command-alias"
        help = ""

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
      expect(cmd.getPaths()).to.eql([
        ["test-group", "test-command"],
        ["test-group", "command-alias"],
      ])
    })

    it("returns all permutations with aliases if both command and group have an alias", () => {
      class TestCommand extends Command {
        name = "test-command"
        alias = "command-alias"
        help = ""

        async action() {
          return {}
        }
      }
      class TestGroup extends CommandGroup {
        name = "test-group"
        alias = "group-alias"
        help = ""

        subCommands = [TestCommand]
      }
      const cmd = new TestCommand(new TestGroup())
      expect(cmd.getPaths()).to.eql([
        ["test-group", "test-command"],
        ["test-group", "command-alias"],
        ["group-alias", "test-command"],
        ["group-alias", "command-alias"],
      ])
    })
  })
})

describe("CommandGroup", () => {
  describe("getSubCommands", () => {
    it("recursively returns all sub-commands", async () => {
      class TestCommandA extends Command {
        name = "test-command-a"
        help = ""

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
        alias = "command-alias"
        help = "Some help text."

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

      expect(trimLineEnds(stripAnsi(cmd.renderHelp())).trim()).to.equal(dedent`
      USAGE
        garden test-group <command> [options]

      COMMANDS
        test-group test-command  Some help text.
      `)
    })
  })
})
