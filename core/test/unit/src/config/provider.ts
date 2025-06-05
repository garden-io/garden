/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getAllProviderDependencyNames } from "../../../../src/config/provider.js"
import { expectError } from "../../../helpers.js"
import { createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { UnresolvedProviderConfig } from "../../../../src/config/project.js"
import type { ObjectWithName } from "../../../../src/util/util.js"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import { TestContext } from "./template-contexts/base.js"

describe("getProviderDependencies", () => {
  const plugin = createGardenPlugin({
    name: "test",
  })

  it("should extract implicit provider dependencies from template strings", async () => {
    const config = makeUnresolvedProvider({
      name: "my-provider",
      someKey: "${providers.other-provider.foo}",
      anotherKey: "foo-${providers.another-provider.bar}",
    })
    expect(getAllProviderDependencyNames(plugin, config, new TestContext({}))).to.eql([
      "another-provider",
      "other-provider",
    ])
  })

  it("should ignore template strings that don't reference providers", async () => {
    const config = makeUnresolvedProvider({
      name: "my-provider",
      someKey: "${providers.other-provider.foo}",
      anotherKey: "foo-${some.other.ref}",
    })
    expect(getAllProviderDependencyNames(plugin, config, new TestContext({}))).to.eql(["other-provider"])
  })

  it("should throw on provider-scoped template strings without a provider name", async () => {
    const config = makeUnresolvedProvider({
      name: "my-provider",
      someKey: "${providers}",
    })

    await expectError(() => getAllProviderDependencyNames(plugin, config, new TestContext({})), {
      contains:
        "Invalid template key 'providers' in configuration for provider 'my-provider'. You must specify a provider name as well (e.g. \\${providers.my-provider}).",
    })
  })
})

function makeUnresolvedProvider(o: ObjectWithName) {
  return new UnresolvedProviderConfig(o.name, [], parseTemplateCollection({ value: o, source: { path: [] } }))
}
