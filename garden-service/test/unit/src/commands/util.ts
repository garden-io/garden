/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec, getPlatform, getArchitecture } from "../../../../src/util/util"
import { makeTempDir, TempDirectory, TestGarden, withDefaultGlobalOpts } from "../../../helpers"
import { FetchToolsCommand } from "../../../../src/commands/util"
import { expect } from "chai"
import { DEFAULT_API_VERSION, GARDEN_GLOBAL_PATH } from "../../../../src/constants"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { pick } from "lodash"
import { join } from "path"
import { defaultNamespace } from "../../../../src/config/project"

describe("FetchToolsCommand", () => {
  let tmpDir: TempDirectory

  const plugin = createGardenPlugin({
    name: "test",
    dependencies: [],
    tools: [
      {
        name: "tool",
        description: "foo",
        type: "binary",
        builds: [
          {
            platform: getPlatform(),
            architecture: getArchitecture(),
            url: "https://raw.githubusercontent.com/garden-io/garden/v0.11.14/.editorconfig",
            sha256: "11f041ba6de46f9f4816afce861f0832e12ede015933f3580d0f6322d3906972",
          },
        ],
      },
    ],
  })

  const expectedPath = join(GARDEN_GLOBAL_PATH, "tools", "tool", "058921ab05f721bb", ".editorconfig")

  before(async () => {
    tmpDir = await makeTempDir()
    await exec("git", ["init"], { cwd: tmpDir.path })
  })

  it("should fetch tools for configured providers", async () => {
    const garden: any = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: tmpDir.path,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test" }],
        variables: {},
      },
    })

    garden.providerConfigs = [{ name: "test" }]
    garden.registeredPlugins = pick(garden["registeredPlugins"], "test")

    await garden.resolveProviders(garden.log)

    const log = garden.log
    const command = new FetchToolsCommand()

    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ all: false }),
    })

    expect(result).to.eql({
      result: {
        "test.tool": {
          type: "binary",
          path: expectedPath,
        },
      },
    })
  })

  it("should fetch tools for all configured providers with --all", async () => {
    const garden: any = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: tmpDir.path,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [],
        variables: {},
      },
    })

    garden.providerConfigs = []
    garden.registeredPlugins = pick(garden["registeredPlugins"], "test")

    await garden.resolveProviders(garden.log)

    const log = garden.log
    const command = new FetchToolsCommand()

    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ all: true }),
    })

    expect(result).to.eql({
      result: {
        "test.tool": {
          type: "binary",
          path: expectedPath,
        },
      },
    })
  })
})
