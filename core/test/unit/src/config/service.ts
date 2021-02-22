/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { baseServiceSpecSchema } from "../../../../src/config/service"
import { validateSchema } from "../../../../src/config/validation"

describe("baseServiceSpecSchema", () => {
  it("should filter falsy values from dependencies list", () => {
    const input = {
      name: "foo",
      dependencies: ["service-a", undefined, "service-b", null, "service-c"],
    }
    const output = validateSchema(input, baseServiceSpecSchema())
    expect(output.dependencies).to.eql(["service-a", "service-b", "service-c"])
  })
})
