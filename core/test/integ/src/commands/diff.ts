/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DiffCommand } from "../../../../src/commands/diff.js"
import type { TempDirectory, TestGarden } from "../../../helpers.js"
import { makeTempDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"
import stripAnsi from "strip-ansi"
import { GitCli } from "../../../../src/vcs/git.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { join } from "node:path"

describe("DiffCommand", () => {
  const cmd = new DiffCommand()
  const defaultOpts = withDefaultGlobalOpts({
    "commit": undefined,
    "branch": undefined,
    "diff-env": undefined,
    "diff-local-env": undefined,
    "diff-var": undefined,
    // Note: Defaulting to --resolve=true to ensure that the actions are fully resolved before comparing.
    "resolve": true,
    "action": undefined,
  })

  let tmpDir: TempDirectory
  let quickstartGarden: TestGarden

  const log = getRootLogger().createLog({})

  before(async () => {
    tmpDir = await makeTempDir()
    let gitCli = new GitCli({ log, cwd: tmpDir.path })
    await gitCli.exec("clone", "https://github.com/garden-io/quickstart-example.git", tmpDir.path)
    gitCli = new GitCli({ log, cwd: tmpDir.path })
    await gitCli.exec("checkout", "diff-test-base")
    await gitCli.exec("checkout", "diff-test-changes")
    quickstartGarden = await makeTestGarden(tmpDir.path, { noTempDir: true, noCache: true })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  it("compares with a different branch", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    expect(stripAnsi(result.projectConfig.resolvedVariablesDiff ?? "")).to.include('+  "postgresPassword": "foo"')
  })

  it("compares with a different commit", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, commit: "58afed93698054ac47cd56223c7b37c4c496de0e" },
    })

    expect(stripAnsi(result.projectConfig.resolvedVariablesDiff ?? "")).to.include('+  "postgresPassword": "foo"')
  })

  it("skips resolving the actions with --resolve=false", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: {
        ...defaultOpts,
        "resolve": false,
        "diff-local-env": [[{ key: "TEST_ENV_VAR_TEST_A", value: "override-a" }]],
      },
    })

    for (const action of Object.values(result.actions)) {
      expect(action.resolvedConfigDiff).to.be.null
    }
  })

  it("picks up direct project config changes", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    expect(stripAnsi(result.projectConfig.rawConfigDiff ?? "")).to.include("+  postgresPassword: foo")
  })

  it("picks up direct action config changes", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    expect(stripAnsi(result.actions["test.unit-vote"].rawConfigDiff ?? "")).to.include("+  env:")
    expect(stripAnsi(result.actions["test.unit-vote"].diffSummary)).to.include("Configuration file modified directly")
    expect(stripAnsi(result.actions["test.unit-vote"].diffSummary)).to.include("+  env:")
  })

  it("picks up direct workflow config changes", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    expect(stripAnsi(result.workflows["test-a"].rawConfigDiff ?? "")).to.include("+    script: echo changed")
    expect(stripAnsi(result.workflows["test-b"].status)).to.equal("removed")
    expect(stripAnsi(result.workflows["test-c"].status)).to.equal("added")
  })

  it("picks up source file changes", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    const summary = stripAnsi(result.actions["build.api"].diffSummary)
    expect(summary).to.include("Source files changed")
    expect(summary).to.include("M Dockerfile")
    expect(summary).to.include("+ test.txt")
    expect(summary).to.include("8 files unchanged")

    const files = result.actions["build.api"].files
    const changedFiles = files.filter((file) => file.status === "modified")
    expect(changedFiles).to.have.length(1)
    expect(changedFiles[0].path).to.equal("Dockerfile")
    const addedFiles = files.filter((file) => file.status === "added")
    expect(addedFiles).to.have.length(1)
    expect(addedFiles[0].path).to.equal("test.txt")
  })

  context("with a project root in a repo subdirectory", () => {
    let tmpDirSub: TempDirectory
    let garden: TestGarden

    before(async () => {
      tmpDirSub = await makeTempDir()
      let gitCli = new GitCli({ log, cwd: tmpDirSub.path })
      await gitCli.exec("clone", "https://github.com/garden-io/quickstart-example.git", tmpDirSub.path)
      gitCli = new GitCli({ log, cwd: tmpDirSub.path })
      await gitCli.exec("checkout", "diff-test-sub-base")
      await gitCli.exec("checkout", "diff-test-sub-changes")
      const projectRoot = join(tmpDirSub.path, "project")
      garden = await makeTestGarden(projectRoot, { noTempDir: true, noCache: true })
    })

    after(async () => {
      await tmpDirSub.cleanup()
    })

    it("compares with a different branch", async () => {
      const { result } = await cmd.action({
        garden,
        log: garden.log,
        args: {},
        opts: { ...defaultOpts, branch: "diff-test-sub-base" },
      })

      expect(stripAnsi(result.projectConfig.resolvedVariablesDiff ?? "")).to.include('+  "postgresPassword": "foo"')
    })
  })
})
