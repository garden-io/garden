/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getResourceRequirements } from "../../../../../../src/plugins/kubernetes/container/util.js"

describe("getResourceRequirements", () => {
  it("should return resources", () => {
    expect(getResourceRequirements({ cpu: { max: 1, min: 1 }, memory: { max: 1, min: 1 } })).to.eql({
      requests: {
        cpu: "1m",
        memory: "1Mi",
      },
      limits: {
        cpu: "1m",
        memory: "1Mi",
      },
    })
  })

  it("should return resources without limits if max values are null", () => {
    expect(getResourceRequirements({ cpu: { max: null, min: 1 }, memory: { max: null, min: 1 } })).to.eql({
      requests: {
        cpu: "1m",
        memory: "1Mi",
      },
    })
  })

  it("should return resources with one limit if one max value is set", () => {
    expect(getResourceRequirements({ cpu: { max: 1, min: 1 }, memory: { max: null, min: 1 } })).to.eql({
      requests: {
        cpu: "1m",
        memory: "1Mi",
      },
      limits: {
        cpu: "1m",
      },
    })
  })

  it("should prioritize deprecated limits param", () => {
    expect(
      getResourceRequirements({ cpu: { max: 1, min: 1 }, memory: { max: null, min: 1 } }, { cpu: 50, memory: 50 })
    ).to.eql({
      requests: {
        cpu: "1m",
        memory: "1Mi",
      },
      limits: {
        cpu: "50m",
        memory: "50Mi",
      },
    })
  })
})
