/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getPackageVersion } from "../../../../src/util/util.js"
import { GardenCli } from "../../../../src/cli/cli.js"
import { VersionCommand } from "../../../../src/commands/version.js"
import type { TempDirectory } from "../../../helpers.js"
import { makeTempDir } from "../../../helpers.js"
import { makeDummyGarden } from "../../../../src/garden.js"

describe("VersionCommand", () => {
  let tmpDir: TempDirectory
  let cli: GardenCli

  beforeEach(async () => {
    cli = new GardenCli({ initLogger: false })
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("aborts with version text if garden version cmd is run", async () => {
    const { code, result } = await cli.run({ args: ["version"] })

    expect(code).to.equal(0)
    expect(result).to.eql({
      version: getPackageVersion(),
    })
  })

  it("aborts with version text if garden V is run", async () => {
    const { code, result } = await cli.run({ args: ["V"] })

    expect(code).to.equal(0)
    expect(result).to.eql({
      version: getPackageVersion(),
    })
  })

  it("aborts with version text if garden v is run", async () => {
    const { code, result } = await cli.run({ args: ["v"] })

    expect(code).to.equal(0)
    expect(result).to.eql({
      version: getPackageVersion(),
    })
  })

  it("returns version when version command is run", async () => {
    const command = new VersionCommand()
    const garden = await makeDummyGarden(tmpDir.path, { commandInfo: { name: "version", args: {}, opts: {} } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result } = await command.action({ log: garden.log } as any)
    expect(result).to.eql({
      version: getPackageVersion(),
    })
  })
})
