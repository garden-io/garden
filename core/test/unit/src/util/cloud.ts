/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { describe } from "mocha"
import { getCloudDistributionName, getCloudLogSectionName } from "../../../../src/util/cloud.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../../../../src/constants.js"
import { expect } from "chai"

describe("garden-cloud", () => {
  describe("getCloudDistributionName", () => {
    context(`when domain name is ${DEFAULT_GARDEN_CLOUD_DOMAIN}`, () => {
      it(`returns "Cloud Dashboard" for ${DEFAULT_GARDEN_CLOUD_DOMAIN}`, () => {
        expect(getCloudDistributionName(DEFAULT_GARDEN_CLOUD_DOMAIN)).to.eql("Cloud Dashboard")
      })
    })

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
  })

  describe("getCloudLogSectionName", () => {
    it(`returns "cloud-dashboard" for "Cloud Dashboard"`, () => {
      expect(getCloudLogSectionName("Cloud Dashboard")).to.eql("cloud-dashboard")
    })

    it(`returns "garden-cloud" for "Garden Cloud"`, () => {
      expect(getCloudLogSectionName("Garden Cloud")).to.eql("garden-cloud")
    })

    it(`returns "garden-enterprise" for "Garden Enterprise"`, () => {
      expect(getCloudLogSectionName("Garden Enterprise")).to.eql("garden-enterprise")
    })
  })
})
