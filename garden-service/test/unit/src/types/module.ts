/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getModuleKey } from "../../../../src/types/module"

describe("module", () => {
  describe("getModuleKey", () => {
    it("should return the module name", () => {
      expect(getModuleKey("foo")).to.equal("foo")
    })
    it("should return the module name, optionally prefixed with a plugin name", () => {
      expect(getModuleKey("foo", "plugin-a")).to.equal("plugin-a--foo")
    })
    it("should not add a prefix if the name already has a prefix", () => {
      const prefixedKey = getModuleKey("plugin-a--foo", "plugin-a")
      expect(getModuleKey(prefixedKey, "plugin-a")).to.equal(prefixedKey)
    })
  })
})
