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
import { getDataDir, makeTempDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"
import stripAnsi from "strip-ansi"
import { GitCli } from "../../../../src/vcs/git.js"

describe("DiffCommand", () => {
  const cmd = new DiffCommand()
  const projectRoot = getDataDir("test-projects", "diff")
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

  let diffGarden: TestGarden

  let tmpDir: TempDirectory
  let quickstartGarden: TestGarden

  before(async () => {
    diffGarden = await makeTestGarden(projectRoot)

    tmpDir = await makeTempDir()
    const gitCli = new GitCli({ log: diffGarden.log, cwd: tmpDir.path })
    await gitCli.exec("clone", "https://github.com/garden-io/quickstart-example.git", tmpDir.path)
    quickstartGarden = await makeTestGarden(tmpDir.path)
    await gitCli.exec("checkout", "diff-test-changes")
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  // TODO: split this into multiple tests
  it("compares with an overridden variable", async () => {
    const { result } = await cmd.action({
      garden: diffGarden,
      log: diffGarden.log,
      args: {},
      opts: { ...defaultOpts, "diff-var": [[{ key: "build-a", value: "override-a" }]] },
    })

    expect(result.projectConfig.status).to.equal("unchanged")
    expect(result.projectConfig.rawConfigDiff).to.be.null
    expect(stripAnsi(result.projectConfig.resolvedVariablesDiff ?? "")).to.include('-  "build-a": "override-a"')
    expect(stripAnsi(result.projectConfig.resolvedVariablesDiff ?? "")).to.include('+  "build-a": "build-a"')

    expect(result.actions["test.test-a"].status).to.equal("modified")
    const testADiffSummary = stripAnsi(result.actions["test.test-a"].diffSummary)
    expect(testADiffSummary).to.include("M  deploy.deploy-a")
    expect(testADiffSummary).to.include("Source files unchanged")
    expect(testADiffSummary).to.include("0 dependants affected by modification")

    expect(result.actions["deploy.deploy-a"].status).to.equal("modified")
    const deployADiffSummary = stripAnsi(result.actions["deploy.deploy-a"].diffSummary)
    expect(deployADiffSummary).to.include("M  build.build-a")
    expect(deployADiffSummary).to.include("Source files unchanged")
    expect(deployADiffSummary).to.include("1 dependant(s) affected by modification")
    expect(result.actions["deploy.deploy-a"].affectedDependants.length).to.equal(1)
    expect(result.actions["deploy.deploy-a"].affectedDependants[0].key).to.equal("test.test-a")

    expect(result.actions["build.build-a"].status).to.equal("modified")
    expect(result.actions["build.build-a"].rawConfigDiff).to.be.null
    expect(result.actions["build.build-a"].resolvedConfigDiff).to.include("override-a")
    const buildADiffSummary = stripAnsi(result.actions["build.build-a"].diffSummary)
    expect(buildADiffSummary).to.include("Source files unchanged")
    expect(buildADiffSummary).to.include("2 dependant(s) affected by modification (1 directly, 1 transitively)")
    expect(result.actions["build.build-a"].affectedDependants.length).to.equal(2)
  })

  it("compares with an overridden local environment variable", async () => {
    const { result } = await cmd.action({
      garden: diffGarden,
      log: diffGarden.log,
      args: {},
      opts: {
        ...defaultOpts,
        "diff-local-env": [[{ key: "TEST_ENV_VAR_TEST_A", value: "override-a" }]],
      },
    })

    const testAResult = result.actions["test.test-a"]
    expect(testAResult.status).to.equal("modified")
    expect(testAResult.rawConfigDiff).to.be.null
    expect(testAResult.resolvedConfigDiff).to.include("override-a")
  })

  it("compares with a different environment", async () => {
    const { result } = await cmd.action({
      garden: diffGarden,
      log: diffGarden.log,
      args: {},
      opts: { ...defaultOpts, "diff-env": "other.local" },
    })

    const testAResult = result.actions["test.test-a"]
    expect(testAResult.status).to.equal("modified")
    expect(testAResult.rawConfigDiff).to.be.null
    expect(testAResult.resolvedConfigDiff).to.include("other")
  })

  it("compares workflows", async () => {
    const { result } = await cmd.action({
      garden: diffGarden,
      log: diffGarden.log,
      args: {},
      opts: { ...defaultOpts, "diff-var": [[{ key: "workflow-a", value: "override-a" }]] },
    })

    expect(result.workflows["workflow-a"].status).to.equal("modified")
    expect(result.workflows["workflow-a"].rawConfigDiff).to.be.null
  })

  it("compares with a different branch", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    expect(result.projectConfig.resolvedVariablesDiff).to.include('+  "postgresPassword": "foo"')
  })

  it("compares with a different commit", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, commit: "58afed93698054ac47cd56223c7b37c4c496de0e" },
    })

    expect(result.projectConfig.resolvedVariablesDiff).to.include('+  "postgresPassword": "foo"')
  })

  it("filters to specific actions", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: {
        ...defaultOpts,
        "action": ["test.test-a"],
        "diff-local-env": [[{ key: "TEST_ENV_VAR_TEST_A", value: "override-a" }]],
      },
    })

    expect(result.actions["test.test-a"]).to.exist
    expect(Object.keys(result.actions)).to.have.length(1)
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

    expect(stripAnsi(result.actions["test.test-a"].rawConfigDiff ?? "")).to.include("+  postgresPassword: foo")
    expect(stripAnsi(result.actions["test.test-a"].diffSummary)).to.include("+  postgresPassword: foo")
  })

  it("picks up direct action config changes", async () => {
    const { result } = await cmd.action({
      garden: quickstartGarden,
      log: quickstartGarden.log,
      args: {},
      opts: { ...defaultOpts, branch: "diff-test-base" },
    })

    expect(stripAnsi(result.actions["test.test-a"].rawConfigDiff ?? "")).to.include("+  env:")
    expect(stripAnsi(result.actions["test.test-a"].diffSummary)).to.include("+  env:")
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
})
