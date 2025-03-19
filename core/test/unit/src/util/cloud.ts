/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { describe } from "mocha"
import { expect } from "chai"
import { getCloudDistributionName, getCloudLogSectionName } from "../../../../src/cloud/util.js"

describe("garden-cloud", () => {
  describe("getCloudDistributionName", () => {
    const projectId = undefined
    context("when no project id is set", () => {
      it("should always return Garden Cloud V2", () => {
        expect(getCloudDistributionName({ domain: "https://backend.app.garden", projectId })).to.eql("Garden Cloud V2")
        expect(getCloudDistributionName({ domain: "https://backend.demo.garden", projectId })).to.eql("Garden Cloud V2")
        expect(getCloudDistributionName({ domain: "https://app.garden-proxy.net", projectId })).to.eql(
          "Garden Cloud V2"
        )
      })
    })

    context("when a project id is set", () => {
      const projectId = "eight-apoplectic-alpacas-443"
      context("when top-level domain is .garden", () => {
        context("when 2nd level domain is .app", () => {
          it(`returns "Garden Cloud" for https urls`, () => {
            expect(getCloudDistributionName({ domain: "https://backend.app.garden", projectId })).to.eql("Garden Cloud")
          })
        })

        context("when 2nd level domain is not .app", () => {
          it(`returns "Garden Enterprise" for https urls`, () => {
            expect(getCloudDistributionName({ domain: "https://backend.demo.garden", projectId })).to.eql(
              "Garden Enterprise"
            )
          })
        })
      })

      context("when domain is something else", () => {
        it(`returns "Garden Enterprise" for https urls`, () => {
          expect(getCloudDistributionName({ domain: "https://app.garden-proxy.net", projectId })).to.eql(
            "Garden Enterprise"
          )
        })
      })
    })

    describe("getCloudLogSectionName", () => {
      it(`returns "garden-dashboard" for "the Garden dashboard"`, () => {
        expect(getCloudLogSectionName("the Garden dashboard")).to.eql("garden-dashboard")
      })

      it(`returns "garden-cloud" for "Garden Cloud"`, () => {
        expect(getCloudLogSectionName("Garden Cloud")).to.eql("garden-cloud")
      })

      it(`returns "garden-enterprise" for "Garden Enterprise"`, () => {
        expect(getCloudLogSectionName("Garden Enterprise")).to.eql("garden-enterprise")
      })
    })
  })
})
