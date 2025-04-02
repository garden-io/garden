/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getArchitecture, getPlatform } from "../../../../src/util/arch-platform.js"
import type { TempDirectory } from "../../../helpers.js"
import {
  makeTempDir,
  TestGarden,
  withDefaultGlobalOpts,
  expectError,
  createProjectConfig,
  getDataDir,
} from "../../../helpers.js"
import { expect } from "chai"
import { createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { ToolsCommand } from "../../../../src/commands/tools.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { dedent } from "../../../../src/util/string.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { makeDummyGarden } from "../../../../src/garden.js"
import { getLogMessages } from "../../../../src/util/testing.js"

describe("ToolsCommand", () => {
  let tmpDir: TempDirectory
  let garden: TestGarden
  let log: Log

  const pluginA = createGardenPlugin({
    name: "test-a",
    dependencies: [],
    tools: [
      {
        name: "tool",
        version: "foo",
        description: "foo",
        type: "binary",
        _includeInGardenImage: false,
        builds: [
          {
            platform: getPlatform(),
            architecture: getArchitecture(),
            url: "file://" + getDataDir("tools", "tool-a.sh"),
            sha256: "90b5248d2fc6106bdf3e5a66e8efd54383b6c4258725e9d455efb7ee32a64223",
          },
        ],
      },
      {
        name: "lib",
        version: "foo",
        description: "foo",
        type: "library",
        _includeInGardenImage: false,
        builds: [
          {
            platform: getPlatform(),
            architecture: getArchitecture(),
            url: "file://" + getDataDir("tools", "tool-a.sh"),
            sha256: "90b5248d2fc6106bdf3e5a66e8efd54383b6c4258725e9d455efb7ee32a64223",
          },
        ],
      },
    ],
  })

  const pluginB = createGardenPlugin({
    name: "test-b",
    dependencies: [],
    tools: [
      {
        name: "tool",
        version: "foo",
        description: "foo",
        type: "binary",
        _includeInGardenImage: false,
        builds: [
          {
            platform: getPlatform(),
            architecture: getArchitecture(),
            url: "file://" + getDataDir("tools", "tool-b.sh"),
            sha256: "b770f87151d8be76214960ecaa45de1b4a892930f1989f28de02bc2f44047ef5",
          },
        ],
      },
    ],
  })

  const command = new ToolsCommand()

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })

    garden = await TestGarden.factory(tmpDir.path, {
      plugins: [pluginA, pluginB],
      config: createProjectConfig({
        path: tmpDir.path,
        providers: [{ name: "test-a" }],
      }),
    })
    log = garden.log

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _garden = garden as any

    _garden.providerConfigs = [{ name: "test-a" }]
    _garden.registeredPlugins = [pluginA, pluginB]
  })

  it("should list tools with no name specified", async () => {
    const { result } = await command.action({
      garden,
      log,
      args: { tool: undefined },
      opts: withDefaultGlobalOpts({ "get-path": false }),
    })

    const infoLog = getLogMessages(log, (entry) => entry.level === LogLevel.info)
      .join("\n")
      .trim()
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")

    expect(infoLog).to.equal(dedent`
    USAGE

      garden [global options] <tool> -- [args ...]
      garden [global options] <tool> --get-path

    PLUGIN TOOLS
      test-a.tool  [binary]   foo
      test-a.lib   [library]  foo
      test-b.tool  [binary]   foo
    `)

    expect(result.tools).to.eql([
      {
        name: "tool",
        description: "foo",
        type: "binary",
        builds: pluginA.tools![0].builds,
        pluginName: "test-a",
        version: "foo",
      },
      {
        name: "lib",
        description: "foo",
        type: "library",
        builds: pluginA.tools![0].builds,
        pluginName: "test-a",
        version: "foo",
      },
      {
        name: "tool",
        description: "foo",
        type: "binary",
        builds: pluginB.tools![0].builds,
        pluginName: "test-b",
        version: "foo",
      },
    ])
  })

  it("should run a configured provider's tool when using name only", async () => {
    const { result } = await command.action({
      garden,
      log,
      args: { "tool": "tool", "--": ["0"] },
      opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
    })

    expect(result.exitCode).to.equal(0)
    expect(result.stdout).to.equal("test-a")
    expect(result.stderr).to.equal("")
  })

  it("should throw on an invalid tool name", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { "tool": "51616ok3xnnz....361.2362&123", "--": ["0"] },
          opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
        }),
      {
        contains:
          "Invalid tool name argument. Please specify either a tool name (no periods) or <plugin name>.<tool name>.",
      }
    )
  })

  it("should throw when plugin name is not found", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { "tool": "bla.tool", "--": ["0"] },
          opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
        }),
      { contains: "Could not find plugin bla." }
    )
  })

  it("should throw when tool name is not found", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { "tool": "bla", "--": ["0"] },
          opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
        }),
      { contains: "Could not find tool bla." }
    )
  })

  it("should run a tool by name when run outside of a project", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _garden: any = await makeDummyGarden(tmpDir.path, {
      skipCloudConnect: true,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })
    _garden.registeredPlugins = [pluginA, pluginB]

    const { result } = await command.action({
      garden: _garden,
      log,
      args: { "tool": "tool", "--": ["0"] },
      opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
    })

    expect(result.exitCode).to.equal(0)
    expect(result.stdout).to.equal("test-a")
    expect(result.stderr).to.equal("")
  })

  it("should run a tool by plugin name and tool name", async () => {
    const { result } = await command.action({
      garden,
      log,
      args: { "tool": "test-b.tool", "--": ["0"] },
      opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
    })

    expect(result.exitCode).to.equal(0)
    expect(result.stdout).to.equal("test-b")
    expect(result.stderr).to.equal("")
  })

  it("should show the path of a library", async () => {
    const { result } = await command.action({
      garden,
      log,
      args: { tool: "test-a.lib" },
      opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
    })

    expect(result.path?.endsWith("tool-a.sh")).to.be.true
    expect(result.exitCode).to.not.exist
    expect(result.stdout).to.not.exist
    expect(result.stderr).to.not.exist
  })

  it("should show the path of a binary with --get-path", async () => {
    const { result } = await command.action({
      garden,
      log,
      args: { tool: "test-a.tool" },
      opts: withDefaultGlobalOpts({ "get-path": true, "output": "json" }),
    })

    expect(result.path?.endsWith("tool-a.sh")).to.be.true
    expect(result.exitCode).to.not.exist
    expect(result.stdout).to.not.exist
    expect(result.stderr).to.not.exist
  })

  it("should return the exit code from a command", async () => {
    const { result } = await command.action({
      garden,
      log,
      args: { "tool": "tool", "--": ["1"] },
      opts: withDefaultGlobalOpts({ "get-path": false, "output": "json" }),
    })

    expect(result.exitCode).to.equal(1)
    expect(result.stdout).to.equal("test-a")
    expect(result.stderr).to.equal("")
  })
})
