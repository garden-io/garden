/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getPackageVersion } from "../../../src/cli/helpers"

describe("helpers", () => {
  describe("getPackageVersion", () => {
    it("returns the version in package.json", async () => {
      const version = require("../../../package.json").version
      expect(getPackageVersion()).to.eq(version)
    })
  })
})
