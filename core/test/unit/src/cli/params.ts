/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { StringsParameter } from "../../../../src/cli/params.js"

describe("StringsParameter", () => {
  const param = new StringsParameter({ help: "" })

  it("should by default split on a comma", () => {
    expect(param.coerce("service-a,service-b")).to.eql(["service-a", "service-b"])
  })

  it("should not split on commas within double-quoted strings", () => {
    expect(param.coerce('key-a="comma,in,value",key-b=foo,key-c=bar')).to.eql([
      'key-a="comma,in,value"',
      "key-b=foo",
      "key-c=bar",
    ])
  })

  it("should handle multiple input values", () => {
    expect(param.coerce(["service-a", "service-b"])).to.eql(["service-a", "service-b"])
  })

  it("should split on delimiter for each input value", () => {
    expect(param.coerce(["service-a", "service-b,service-c"])).to.eql(["service-a", "service-b", "service-c"])
  })
})
