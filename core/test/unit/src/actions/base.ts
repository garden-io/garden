/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../../src/constants.js"
import type { ActionConfig } from "../../../../src/actions/types.js"
import { getActionConfigVersion } from "../../../../src/actions/base.js"

describe("getActionConfigVersion", () => {
  function minimalActionConfig(): ActionConfig {
    return {
      kind: "Build",
      type: "test",
      name: "foo",
      timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      internal: {
        basePath: ".",
      },
      spec: {},
    }
  }

  context("action config version does not change", () => {
    it("on exclude field modification", () => {
      const config1 = minimalActionConfig()
      config1.exclude = ["dir1"]
      const version1 = getActionConfigVersion(config1)

      const config2 = minimalActionConfig()
      config2.exclude = ["dir2"]
      const version2 = getActionConfigVersion(config2)

      expect(version1).to.eql(version2)
    })
  })
})
