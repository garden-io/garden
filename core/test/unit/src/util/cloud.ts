/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { describe } from "mocha"
import { expect } from "chai"
import { getCloudDistributionName, getCloudLogSectionName } from "../../../../src/cloud/util.js"

describe("garden-cloud", () => {
  context("when top-level domain is .garden", () => {
    context("when 2nd level domain is .app", () => {
      it(`returns "Garden Cloud" for https urls`, () => {
        expect(getCloudDistributionName("https://backend.app.garden")).to.eql("Garden Cloud")
      })
    })

    context("when 2nd level domain is not .app", () => {
      it(`returns "Garden Enterprise" for https urls`, () => {
        expect(getCloudDistributionName("https://backend.demo.garden")).to.eql("Garden Enterprise")
      })
    })
  })

  context("when domain is something else", () => {
    it(`returns "Garden Enterprise" for https urls`, () => {
      expect(getCloudDistributionName("https://app.garden-proxy.net")).to.eql("Garden Enterprise")
    })
  })

  describe("getCloudLogSectionName", () => {
    it(`returns "garden-cloud" for "Garden Cloud"`, () => {
      expect(getCloudLogSectionName("Garden Cloud")).to.eql("garden-cloud")
    })

    it(`returns "garden-enterprise" for "Garden Enterprise"`, () => {
      expect(getCloudLogSectionName("Garden Enterprise")).to.eql("garden-enterprise")
    })
  })
})
