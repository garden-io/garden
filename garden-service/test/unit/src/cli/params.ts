/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { StringsParameter } from "../../../../src/cli/params"

describe("StringsParameter", () => {
  it("should by default split on a comma", () => {
    const param = new StringsParameter({ help: "" })
    expect(param.coerce("service-a,service-b")).to.eql(["service-a", "service-b"])
  })

  it("should not split on commas within double-quoted strings", () => {
    const param = new StringsParameter({ help: "" })
    expect(param.coerce('key-a="comma,in,value",key-b=foo,key-c=bar')).to.eql([
      'key-a="comma,in,value"',
      "key-b=foo",
      "key-c=bar",
    ])
  })
})
