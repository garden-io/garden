/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { projectRootA, makeTestGarden } from "../../../../helpers.js"
import { ProviderConfigContext } from "../../../../../src/config/template-contexts/provider.js"

describe("ProviderConfigContext", () => {
  it("should set an empty namespace and environment.fullName to environment.name if no namespace is set", async () => {
    const garden = await makeTestGarden(projectRootA, { environmentString: "local" })
    const c = new ProviderConfigContext(garden, await garden.resolveProviders({ log: garden.log }), garden.variables)

    expect(c.resolve({ nodePath: [], key: ["environment", "name"], opts: {} })).to.eql({
      found: true,
      resolved: "local",
    })
  })

  it("should set environment.namespace and environment.fullName to properly if namespace is set", async () => {
    const garden = await makeTestGarden(projectRootA, { environmentString: "foo.local" })
    const c = new ProviderConfigContext(garden, await garden.resolveProviders({ log: garden.log }), garden.variables)

    expect(c.resolve({ nodePath: [], key: ["environment", "name"], opts: {} })).to.eql({
      found: true,
      resolved: "local",
    })
    expect(c.resolve({ nodePath: [], key: ["environment", "namespace"], opts: {} })).to.eql({
      found: true,
      resolved: "foo",
    })
    expect(c.resolve({ nodePath: [], key: ["environment", "fullName"], opts: {} })).to.eql({
      found: true,
      resolved: "foo.local",
    })
  })
})
