/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ConfigContext } from "../../../../../src/config/template-contexts/base"
import { projectRootA, makeTestGarden } from "../../../../helpers"
import { ProviderConfigContext } from "../../../../../src/config/template-contexts/provider"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues {
  [key: string]: TestValue
}

describe("ProviderConfigContext", () => {
  it("should set an empty namespace and environment.fullName to environment.name if no namespace is set", async () => {
    const garden = await makeTestGarden(projectRootA, { environmentName: "local" })
    const c = new ProviderConfigContext(garden, await garden.resolveProviders(garden.log), garden.variables)

    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({ resolved: "local" })
  })

  it("should set environment.namespace and environment.fullName to properly if namespace is set", async () => {
    const garden = await makeTestGarden(projectRootA, { environmentName: "foo.local" })
    const c = new ProviderConfigContext(garden, await garden.resolveProviders(garden.log), garden.variables)

    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({ resolved: "local" })
    expect(c.resolve({ key: ["environment", "namespace"], nodePath: [], opts: {} })).to.eql({ resolved: "foo" })
    expect(c.resolve({ key: ["environment", "fullName"], nodePath: [], opts: {} })).to.eql({ resolved: "foo.local" })
  })
})
