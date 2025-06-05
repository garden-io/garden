/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { validateSchema } from "../../../../src/config/validation.js"
import { portSchema } from "../../../../src/plugins/container/config.js"

describe("portSchema", () => {
  it("should default servicePort to containerPorts value", async () => {
    const containerPort = 8080
    const obj = { name: "a", containerPort }

    const value = validateSchema<typeof obj>(obj, portSchema())
    expect(value["servicePort"]).to.equal(containerPort)
  })

  it("should not default servicePort to containerPorts when configured", async () => {
    const containerPort = 8080
    const servicePort = 9090
    const obj = { name: "a", containerPort, servicePort }

    const value = validateSchema<typeof obj>(obj, portSchema())
    expect(value["servicePort"]).to.equal(servicePort)
  })
})
