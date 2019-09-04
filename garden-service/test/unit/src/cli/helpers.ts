/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { parseLogLevel, getLogLevelChoices } from "../../../../src/cli/helpers"
import { expectError } from "../../../helpers"
import { getPackageVersion } from "../../../../src/util/util"
import { GARDEN_SERVICE_ROOT } from "../../../../src/constants"
import { join } from "path"

describe("helpers", () => {
  const validLogLevels = ["error", "warn", "info", "verbose", "debug", "silly", "0", "1", "2", "3", "4", "5"]

  describe("getPackageVersion", () => {
    it("should return the version in package.json", async () => {
      const version = require(join(GARDEN_SERVICE_ROOT, "package.json")).version
      expect(getPackageVersion()).to.eq(version)
    })
  })

  describe("getLogLevelChoices", () => {
    it("should return all valid log levels as strings", async () => {
      const choices = getLogLevelChoices().sort()
      const sorted = [...validLogLevels].sort()
      expect(choices).to.eql(sorted)
    })
  })

  describe("parseLogLevel", () => {
    it("should return a level integer if valid", async () => {
      const parsed = validLogLevels.map((el) => parseLogLevel(el))
      expect(parsed).to.eql([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5])
    })
    it("should throw if level is not valid", async () => {
      await expectError(() => parseLogLevel("banana"), "internal")
    })
    it("should throw if level is not valid", async () => {
      await expectError(() => parseLogLevel("-1"), "internal")
    })
    it("should throw if level is not valid", async () => {
      await expectError(() => parseLogLevel(""), "internal")
    })
  })
})
