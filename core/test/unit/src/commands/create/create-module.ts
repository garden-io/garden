/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { withDefaultGlobalOpts, TempDirectory, makeTempDir, expectError } from "../../../../helpers"
import { CreateModuleCommand, getModuleTypeSuggestions } from "../../../../../src/commands/create/create-module"
import { makeDummyGarden } from "../../../../../src/cli/cli"
import { Garden } from "../../../../../src/garden"
import { join } from "path"
import { pathExists, readFile, writeFile, mkdirp } from "fs-extra"
import { safeLoadAll } from "js-yaml"
import { exec, safeDumpYaml } from "../../../../../src/util/util"
import stripAnsi = require("strip-ansi")
import { getModuleTypes } from "../../../../../src/plugins"
import { getSupportedPlugins } from "../../../../../src/plugins/plugins"
import inquirer = require("inquirer")
import { defaultConfigFilename } from "../../../../../src/util/fs"

describe("CreateModuleCommand", () => {
  const command = new CreateModuleCommand()
  let tmp: TempDirectory
  let garden: Garden

  beforeEach(async () => {
    tmp = await makeTempDir()
    await exec("git", ["init"], { cwd: tmp.path })
    garden = await makeDummyGarden(tmp.path)
  })

  afterEach(async () => {
    await tmp?.cleanup()
  })

  it("should create a module config", async () => {
    const dir = join(tmp.path, "test")
    await mkdirp(dir)

    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir,
        interactive: false,
        name: undefined,
        type: "exec",
        filename: defaultConfigFilename,
      }),
    })
    const { name, configPath } = result!

    expect(name).to.equal("test")
    expect(configPath).to.equal(join(dir, "garden.yml"))
    expect(await pathExists(configPath)).to.be.true

    const parsed = safeLoadAll((await readFile(configPath)).toString())

    expect(parsed).to.eql([
      {
        kind: "Module",
        name,
        type: "exec",
      },
    ])
  })

  it("should allow overriding the default generated filename", async () => {
    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: "test",
        type: "exec",
        filename: "custom.garden.yml",
      }),
    })
    const { configPath } = result!

    expect(configPath).to.equal(join(tmp.path, "custom.garden.yml"))
    expect(await pathExists(configPath)).to.be.true
  })

  it("should optionally set a module name", async () => {
    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: "test",
        type: "exec",
        filename: defaultConfigFilename,
      }),
    })
    const { name, configPath } = result!

    expect(name).to.equal("test")
    const parsed = safeLoadAll((await readFile(configPath)).toString())
    expect(parsed).to.eql([
      {
        kind: "Module",
        name: "test",
        type: "exec",
      },
    ])
  })

  it("should add to an existing garden.yml if one exists", async () => {
    const existing = {
      kind: "Module",
      type: "foo",
      name: "foo",
    }
    await writeFile(join(tmp.path, "garden.yml"), safeDumpYaml(existing))

    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: "test",
        type: "exec",
        filename: defaultConfigFilename,
      }),
    })
    const { name, configPath } = result!

    const parsed = safeLoadAll((await readFile(configPath)).toString())
    expect(parsed).to.eql([
      existing,
      {
        kind: "Module",
        name,
        type: "exec",
      },
    ])
  })

  it("should throw if a module with the same name is already in the directory", async () => {
    const existing = {
      kind: "Module",
      name: "test",
      type: "exec",
    }
    const configPath = join(tmp.path, "garden.yml")
    await writeFile(configPath, safeDumpYaml(existing))

    await expectError(
      () =>
        command.action({
          garden,
          footerLog: garden.log,
          headerLog: garden.log,
          log: garden.log,
          args: {},
          opts: withDefaultGlobalOpts({
            dir: tmp.path,
            interactive: false,
            name: "test",
            type: "exec",
            filename: defaultConfigFilename,
          }),
        }),
      (err) => expect(stripAnsi(err.message)).to.equal("A Garden module named test already exists in " + configPath)
    )
  })

  it("should throw if target directory doesn't exist", async () => {
    const dir = join(tmp.path, "bla")
    await expectError(
      () =>
        command.action({
          garden,
          footerLog: garden.log,
          headerLog: garden.log,
          log: garden.log,
          args: {},
          opts: withDefaultGlobalOpts({
            dir,
            interactive: false,
            name: "test",
            type: "exec",
            filename: defaultConfigFilename,
          }),
        }),
      (err) => expect(err.message).to.equal(`Path ${dir} does not exist`)
    )
  })

  it("should throw if the module type doesn't exist", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          footerLog: garden.log,
          headerLog: garden.log,
          log: garden.log,
          args: {},
          opts: withDefaultGlobalOpts({
            dir: tmp.path,
            interactive: false,
            name: undefined,
            type: "foo",
            filename: defaultConfigFilename,
          }),
        }),
      (err) => expect(stripAnsi(err.message)).to.equal("Could not find module type foo")
    )
  })

  describe("getModuleTypeSuggestions", () => {
    const moduleTypes = getModuleTypes(getSupportedPlugins().map((f) => f()))

    it("should return a list of all supported module types", async () => {
      const result = await getModuleTypeSuggestions(garden.log, moduleTypes, tmp.path, "test")

      expect(result).to.eql([
        ...Object.keys(moduleTypes).map((type) => ({ name: type, value: { kind: "Module", type, name: "test" } })),
      ])
    })

    it("should include suggestions from providers if applicable", async () => {
      await writeFile(join(tmp.path, "Dockerfile"), "")
      await writeFile(join(tmp.path, "Chart.yaml"), "")
      await writeFile(join(tmp.path, "foo.tf"), "")

      const result = <any>await getModuleTypeSuggestions(garden.log, moduleTypes, tmp.path, "test")

      const stripped = result.map((r) => (r instanceof inquirer.Separator ? r : { ...r, name: stripAnsi(r.name) }))

      expect(stripped).to.eql([
        {
          name: "container (based on found Dockerfile, suggested by container)",
          short: "container",
          value: {
            kind: "Module",
            type: "container",
            name: "test",
            dockerfile: "Dockerfile",
          },
        },
        {
          name: "helm (based on found Chart.yaml, suggested by kubernetes)",
          short: "helm",
          value: { type: "helm", name: "test", chartPath: "." },
        },
        {
          name: "terraform (based on found .tf files, suggested by terraform)",
          short: "terraform",
          value: { type: "terraform", name: "test", autoApply: false },
        },
        new inquirer.Separator(),
        ...Object.keys(moduleTypes).map((type) => ({ name: type, value: { kind: "Module", type, name: "test" } })),
      ])
    })
  })
})
