/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { withDefaultGlobalOpts, TempDirectory, makeTempDir, expectError } from "../../../../helpers"
import { CreateProjectCommand } from "../../../../../src/commands/create/create-project"
import { makeDummyGarden } from "../../../../../src/cli/cli"
import { Garden } from "../../../../../src/garden"
import { basename, join } from "path"
import { pathExists, readFile, writeFile } from "fs-extra"
import { safeLoadAll } from "js-yaml"
import { exec, safeDumpYaml } from "../../../../../src/util/util"

describe("CreateProjectCommand", () => {
  const command = new CreateProjectCommand()
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

  it("should create a project config and a .gardenignore", async () => {
    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({ dir: tmp.path, interactive: false, name: undefined }),
    })
    const { name, configPath, ignoreFileCreated, ignoreFilePath } = result!

    expect(name).to.equal(basename(tmp.path))
    expect(ignoreFileCreated).to.be.true
    expect(configPath).to.equal(join(tmp.path, "garden.yml"))
    expect(ignoreFilePath).to.equal(join(tmp.path, ".gardenignore"))
    expect(await pathExists(configPath)).to.be.true
    expect(await pathExists(ignoreFilePath)).to.be.true

    const parsed = safeLoadAll((await readFile(configPath)).toString())

    expect(parsed).to.eql([
      {
        kind: "Project",
        name,
        environments: [{ name: "default" }],
        providers: [{ name: "local-kubernetes" }],
      },
    ])
  })

  it("should leave existing .gardenignore if one already exists", async () => {
    const ignoreContent = "node_modules/\n"
    await writeFile(join(tmp.path, ".gardenignore"), ignoreContent)

    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({ dir: tmp.path, interactive: false, name: undefined }),
    })
    const { ignoreFileCreated, ignoreFilePath } = result!

    expect(ignoreFileCreated).to.be.false
    expect(await pathExists(ignoreFilePath)).to.be.true
    expect((await readFile(ignoreFilePath)).toString()).to.equal(ignoreContent)
  })

  it("should optionally set a project name", async () => {
    const { result } = await command.action({
      garden,
      footerLog: garden.log,
      headerLog: garden.log,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({ dir: tmp.path, interactive: false, name: "foo" }),
    })
    const { name, configPath } = result!

    expect(name).to.equal("foo")
    const parsed = safeLoadAll((await readFile(configPath)).toString())
    expect(parsed).to.eql([
      {
        kind: "Project",
        name: "foo",
        environments: [{ name: "default" }],
        providers: [{ name: "local-kubernetes" }],
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
      opts: withDefaultGlobalOpts({ dir: tmp.path, interactive: false, name: undefined }),
    })
    const { name, configPath } = result!

    const parsed = safeLoadAll((await readFile(configPath)).toString())
    expect(parsed).to.eql([
      existing,
      {
        kind: "Project",
        name,
        environments: [{ name: "default" }],
        providers: [{ name: "local-kubernetes" }],
      },
    ])
  })

  it("should throw if a project is already in the directory", async () => {
    const existing = {
      kind: "Project",
      name: "foo",
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
          opts: withDefaultGlobalOpts({ dir: tmp.path, interactive: false, name: undefined }),
        }),
      (err) => expect(err.message).to.equal("A Garden project already exists in " + configPath)
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
          opts: withDefaultGlobalOpts({ dir, interactive: false, name: undefined }),
        }),
      (err) => expect(err.message).to.equal(`Path ${dir} does not exist`)
    )
  })
})
