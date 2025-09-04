/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DiffCommand } from "../../../../src/commands/diff.js"
import type { TestGarden } from "../../../helpers.js"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"
import stripAnsi from "strip-ansi"

describe("DiffCommand", () => {
  const cmd = new DiffCommand()
  const projectRoot = getDataDir("test-projects", "diff")
  const defaultOpts = withDefaultGlobalOpts({
    "b-commit": undefined,
    "b-branch": undefined,
    "b-env": undefined,
    "b-local-env-var": undefined,
    "b-var": undefined,
    // Note: Defaulting to --resolve=true to ensure that the actions are fully resolved before comparing.
    "resolve": true,
    "action": undefined,
  })

  let diffGarden: TestGarden

  before(async () => {
    diffGarden = await makeTestGarden(projectRoot)
  })

  // TODO: split this into multiple tests
  it("compares with an overridden variable", async () => {
    const { result } = await cmd.action({
      garden: diffGarden,
      log: diffGarden.log,
      args: {},
      opts: { ...defaultOpts, "b-var": [[{ key: "build-a", value: "override-a" }]] },
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
        "b-local-env-var": [[{ key: "TEST_ENV_VAR_TEST_A", value: "override-a" }]],
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
      opts: { ...defaultOpts, "b-env": "other.local" },
    })

    const testAResult = result.actions["test.test-a"]
    expect(testAResult.status).to.equal("modified")
    expect(testAResult.rawConfigDiff).to.be.null
    expect(testAResult.resolvedConfigDiff).to.include("other")
  })

  it("filters to specific actions", async () => {
    const { result } = await cmd.action({
      garden: diffGarden,
      log: diffGarden.log,
      args: {},
      opts: {
        ...defaultOpts,
        "action": ["test.test-a"],
        "b-local-env-var": [[{ key: "TEST_ENV_VAR_TEST_A", value: "override-a" }]],
      },
    })

    expect(result.actions["test.test-a"]).to.exist
    expect(Object.keys(result.actions)).to.have.length(1)
  })
})
