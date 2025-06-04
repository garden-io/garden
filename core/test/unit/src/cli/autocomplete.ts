/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Autocompleter } from "../../../../src/cli/autocomplete.js"
import { globalDisplayOptions, globalOptions } from "../../../../src/cli/params.js"
import { BuildCommand } from "../../../../src/commands/build.js"
import { getBuiltinCommands } from "../../../../src/commands/commands.js"
import type { ConfigDump } from "../../../../src/garden.js"
import type { TestGarden } from "../../../helpers.js"
import { makeTestGardenA } from "../../../helpers.js"

describe("Autocompleter", () => {
  let garden: TestGarden
  let configDump: ConfigDump
  let ac: Autocompleter

  const globalFlags = Object.keys(globalOptions)
  const buildFlags = Object.keys(new BuildCommand().options)
  const flags = [...globalFlags, ...buildFlags].map((f) => "--" + f)

  const commands = getBuiltinCommands()

  before(async () => {
    garden = await makeTestGardenA()
    configDump = await garden.dumpConfig({ log: garden.log })
    ac = new Autocompleter({ log: garden.log, commands, debug: true })
  })

  it("suggests nothing with empty input", () => {
    const result = ac.getSuggestions("")
    expect(result).to.eql([])
  })

  it("suggests nothing with all-space input", () => {
    const result = ac.getSuggestions("  ")
    expect(result).to.eql([])
  })

  it("returns one command on close match", () => {
    const result = ac.getSuggestions("buil")
    expect(result.length).to.equal(1)
    expect(result[0]).to.eql({
      type: "command",
      line: "build",
      command: {
        name: ["build"],
        cliOnly: false,
        stringArguments: [],
      },
      priority: 1,
    })
  })

  it("returns many command names including subcommands with short input", () => {
    const result = ac.getSuggestions("lo")
    // Not testing for the ordering here, easiest to sort alphabetically
    expect(result.map((s) => s.line).sort()).to.eql(["login", "logout", "logs"])
  })

  it("returns command names sorted by length", () => {
    const result = ac.getSuggestions("lo")
    // Not testing for the ordering here, easiest to sort alphabetically
    expect(result.map((s) => s.line)).to.eql(["logs", "login", "logout"])
  })

  it("returns subcommands when matching on command group", () => {
    const result = ac.getSuggestions("link")
    expect(result.map((s) => s.line).sort()).to.eql(["link action", "link module", "link source"])
  })

  it("filters option flags", () => {
    const result = ac.getSuggestions("build --f")
    const lines = result.map((s) => s.line)
    expect(lines).to.eql(["build --force", "build --force-refresh"])
  })

  it("returns option flag alias if no canonical flag name is matched", () => {
    const result = ac.getSuggestions("deploy --dev")
    const lines = result.map((s) => s.line)
    expect(lines).to.eql(["deploy --dev", "deploy --dev-mode"])
  })

  it("returns single char alias", () => {
    const result = ac.getSuggestions("build -f")
    const lines = result.map((s) => s.line)
    expect(lines).to.eql(["build -f"])
  })

  it("returns the command itself when matched verbatim", () => {
    const result = ac.getSuggestions("build")
    const lines = result.map((s) => s.line)
    expect(lines).to.include("build")
  })

  it("returns the input with command info on full match with option flag", () => {
    const result = ac.getSuggestions("build --force")
    const lines = result.map((s) => s.line)
    expect(lines).to.include("build --force")
  })

  it("deduplicates matched command names, preferring canonical ones", () => {
    const result = ac.getSuggestions("clean")
    const lines = result.map((s) => s.line)
    expect(lines).to.include("cleanup namespace")
    expect(lines).to.not.include("cleanup ns")
  })

  it("deduplicates matched aliases, preferring shorter ones", () => {
    const result = ac.getSuggestions("del")
    const lines = result.map((s) => s.line)
    expect(lines).to.include("del ns")
    expect(lines).to.not.include("delete namespace")
    expect(lines).to.not.include("delete ns")
  })

  context("without config dump", () => {
    it("returns option flags after matched command", () => {
      const result = ac.getSuggestions("build")

      for (const f of flags) {
        const matched = result.find((s) => s.line === "build " + f)
        expect(matched).to.exist
        expect(matched?.command.stringArguments).to.eql([f])
      }
    })

    it("skips global option flags when ignoreGlobalFlags=true", () => {
      const result = ac.getSuggestions("build", { ignoreGlobalFlags: true })

      const lines = result.map((s) => s.line)

      for (const s of Object.keys(globalDisplayOptions).map((f) => "--" + f)) {
        expect(lines).to.not.include("build " + s)
      }
    })
  })

  context("with config dump", () => {
    beforeEach(() => {
      ac = new Autocompleter({ log: garden.log, commands, configDump, debug: true })
    })

    it("returns suggested positional args and option flags after matched command", () => {
      const result = ac.getSuggestions("build")

      for (const f of [...flags, ...Object.keys(configDump.actionConfigs.Build)]) {
        const matched = result.find((s) => s.line === "build " + f)
        expect(matched).to.exist
        expect(matched?.command.stringArguments).to.eql([f])
      }
    })

    it("ranks positional args above option flags", () => {
      const result = ac.getSuggestions("build")
      const lines = result.map((s) => s.line)
      expect(lines[0]).to.equal("build module-a")
      expect(lines[1]).to.equal("build module-b")
      expect(lines[2]).to.equal("build module-c")
      expect(lines[3].startsWith("build --")).to.be.true
    })

    it("returns suggested positional args and option flags after matched command and space", () => {
      const result = ac.getSuggestions("build ")

      const lines = result.map((s) => s.line)

      for (const s of [...flags, ...Object.keys(configDump.actionConfigs.Build)]) {
        expect(lines).to.include("build " + s)
      }
    })

    it("returns the input with command info on full match with positional argument", () => {
      const result = ac.getSuggestions("build module-a")
      const lines = result.map((s) => s.line)
      expect(lines).to.include("build module-a")
    })

    it("returns more (unique) suggestions for variadic args after first arg", () => {
      const input = "build module-a "
      const result = ac.getSuggestions(input)

      const lines = result.map((s) => s.line)

      for (const s of ["module-b", "module-c", ...flags]) {
        expect(lines).to.include(input + s)
      }

      // Should not suggest already entered suggestions
      expect(lines).to.not.include(input + "module-a")
    })

    it("returns more (unique) suggestions for variadic args after second arg", () => {
      const input = "build module-a module-b "
      const result = ac.getSuggestions(input)

      const lines = result.map((s) => s.line)

      for (const s of ["module-c", ...flags]) {
        expect(lines).to.include(input + s)
      }

      // Should not suggest already entered suggestions
      expect(lines).to.not.include(input + "module-a")
      expect(lines).to.not.include(input + "module-b")
    })

    it("returns nothing if typing a positional argument that matches no suggested value", () => {
      const result = ac.getSuggestions("build z")
      expect(result).to.eql([])
    })
  })
})
