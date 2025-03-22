/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { TempDirectory } from "../../../../helpers.js"
import { withDefaultGlobalOpts, makeTempDir, expectError } from "../../../../helpers.js"
import {
  CreateProjectCommand,
  defaultProjectConfigFilename,
} from "../../../../../src/commands/create/create-project.js"
import { makeDummyGarden } from "../../../../../src/garden.js"
import type { Garden } from "../../../../../src/garden.js"
import { basename, join } from "path"
import fsExtra from "fs-extra"
const { pathExists, readFile, writeFile } = fsExtra
import { loadAll } from "js-yaml"
import { safeDumpYaml } from "../../../../../src/util/serialization.js"
import { GardenApiVersion } from "../../../../../src/constants.js"

describe("CreateProjectCommand", () => {
  const command = new CreateProjectCommand()
  let tmp: TempDirectory
  let garden: Garden

  beforeEach(async () => {
    tmp = await makeTempDir({ git: true, initialCommit: false })
    garden = await makeDummyGarden(tmp.path, { commandInfo: { name: "create project", args: {}, opts: {} } })
  })

  afterEach(async () => {
    await tmp?.cleanup()
  })

  it("should create a project config and a .gardenignore", async () => {
    const { result } = await command.action({
      garden,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: undefined,
        filename: defaultProjectConfigFilename,
      }),
    })
    const { name, configPath, ignoreFileCreated, ignoreFilePath } = result!

    expect(name).to.equal(basename(tmp.path))
    expect(ignoreFileCreated).to.be.true
    expect(configPath).to.equal(join(tmp.path, "project.garden.yml"))
    expect(ignoreFilePath).to.equal(join(tmp.path, ".gardenignore"))
    expect(await pathExists(configPath)).to.be.true
    expect(await pathExists(ignoreFilePath)).to.be.true

    const parsed = loadAll((await readFile(configPath)).toString())

    expect(parsed).to.eql([
      {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name,
        defaultEnvironment: "local",
        environments: [
          { name: "local", defaultNamespace: `${name}` },
          {
            name: "remote-dev",
            defaultNamespace: `${name}-${"${kebabCase(local.username)}"}`,
          },
          { name: "ci", defaultNamespace: `${name}-${"${git.branch}"}-${"${git.commitHash}"}` },
          { name: "preview", defaultNamespace: `${name}-${"${git.branch}"}` },
        ],
        providers: [
          { name: "local-kubernetes", environments: ["local"] },
          { name: "kubernetes", environments: ["remote-dev", "ci", "preview"] },
        ],
      },
    ])
  })

  it("should leave existing .gardenignore if one already exists", async () => {
    const ignoreContent = "node_modules/\n"
    await writeFile(join(tmp.path, ".gardenignore"), ignoreContent)

    const { result } = await command.action({
      garden,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: undefined,
        filename: defaultProjectConfigFilename,
      }),
    })
    const { ignoreFileCreated, ignoreFilePath } = result!

    expect(ignoreFileCreated).to.be.false
    expect(await pathExists(ignoreFilePath)).to.be.true
    expect((await readFile(ignoreFilePath)).toString()).to.equal(ignoreContent)
  })

  it("should copy existing .gitignore to .gardenignore if it exists", async () => {
    const ignoreContent = "node_modules/\n"
    await writeFile(join(tmp.path, ".gitignore"), ignoreContent)

    const { result } = await command.action({
      garden,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: undefined,
        filename: defaultProjectConfigFilename,
      }),
    })
    const { ignoreFileCreated, ignoreFilePath } = result!

    expect(ignoreFileCreated).to.be.true
    expect(await pathExists(ignoreFilePath)).to.be.true
    expect((await readFile(ignoreFilePath)).toString()).to.equal(ignoreContent)
  })

  it("should optionally set a project name", async () => {
    const { result } = await command.action({
      garden,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: "foo",
        filename: defaultProjectConfigFilename,
      }),
    })
    const { name, configPath } = result!

    expect(name).to.equal("foo")
    const parsed = loadAll((await readFile(configPath)).toString())
    expect(parsed).to.eql([
      {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name,
        defaultEnvironment: "local",
        environments: [
          { name: "local", defaultNamespace: `foo` },
          {
            name: "remote-dev",
            defaultNamespace: `foo-${"${kebabCase(local.username)}"}`,
          },
          { name: "ci", defaultNamespace: `foo-${"${git.branch}"}-${"${git.commitHash}"}` },
          { name: "preview", defaultNamespace: `foo-${"${git.branch}"}` },
        ],
        providers: [
          { name: "local-kubernetes", environments: ["local"] },
          { name: "kubernetes", environments: ["remote-dev", "ci", "preview"] },
        ],
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
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: undefined,
        filename: "garden.yml",
      }),
    })
    const { name, configPath } = result!

    const parsed = loadAll((await readFile(configPath)).toString())
    expect(parsed).to.eql([
      existing,
      {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name,
        defaultEnvironment: "local",
        environments: [
          { name: "local", defaultNamespace: `${name}` },
          {
            name: "remote-dev",
            defaultNamespace: `${name}-${"${kebabCase(local.username)}"}`,
          },
          { name: "ci", defaultNamespace: `${name}-${"${git.branch}"}-${"${git.commitHash}"}` },
          { name: "preview", defaultNamespace: `${name}-${"${git.branch}"}` },
        ],
        providers: [
          { name: "local-kubernetes", environments: ["local"] },
          { name: "kubernetes", environments: ["remote-dev", "ci", "preview"] },
        ],
      },
    ])
  })

  it("should allow overriding the default generated filename", async () => {
    const { result } = await command.action({
      garden,
      log: garden.log,
      args: {},
      opts: withDefaultGlobalOpts({
        dir: tmp.path,
        interactive: false,
        name: undefined,
        filename: "custom.garden.yml",
      }),
    })
    const { configPath } = result!

    expect(configPath).to.equal(join(tmp.path, "custom.garden.yml"))
    expect(await pathExists(configPath)).to.be.true
  })

  it("should throw if a project is already in the directory", async () => {
    const existing = {
      apiVersion: GardenApiVersion.v2,
      kind: "Project",
      name: "foo",
    }
    const configPath = join(tmp.path, defaultProjectConfigFilename)
    await writeFile(configPath, safeDumpYaml(existing))

    await expectError(
      () =>
        command.action({
          garden,
          log: garden.log,
          args: {},
          opts: withDefaultGlobalOpts({
            dir: tmp.path,
            interactive: false,
            name: undefined,
            filename: defaultProjectConfigFilename,
          }),
        }),
      { contains: `A Garden project already exists in ${configPath}` }
    )
  })

  it("should throw if target directory doesn't exist", async () => {
    const dir = join(tmp.path, "bla")
    await expectError(
      () =>
        command.action({
          garden,
          log: garden.log,
          args: {},
          opts: withDefaultGlobalOpts({
            dir,
            interactive: false,
            name: undefined,
            filename: defaultProjectConfigFilename,
          }),
        }),
      { contains: `Path ${dir} does not exist` }
    )
  })
})
