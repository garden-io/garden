/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { GenericProviderConfig, getAllProviderDependencyNames } from "../../../../src/config/provider"
import { expectError } from "../../../helpers"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"

describe("getProviderDependencies", () => {
  const plugin = createGardenPlugin({
    name: "test",
  })

  it("should extract implicit provider dependencies from template strings", async () => {
    const config: GenericProviderConfig = {
      name: "my-provider",
      someKey: "${providers.other-provider.foo}",
      anotherKey: "foo-${providers.another-provider.bar}",
    }
    expect(await getAllProviderDependencyNames(plugin, config)).to.eql(["another-provider", "other-provider"])
  })

  it("should ignore template strings that don't reference providers", async () => {
    const config: GenericProviderConfig = {
      name: "my-provider",
      someKey: "${providers.other-provider.foo}",
      anotherKey: "foo-${some.other.ref}",
    }
    expect(await getAllProviderDependencyNames(plugin, config)).to.eql(["other-provider"])
  })

  it("should throw on provider-scoped template strings without a provider name", async () => {
    const config: GenericProviderConfig = {
      name: "my-provider",
      someKey: "${providers}",
    }

    await expectError(
      () => getAllProviderDependencyNames(plugin, config),
      (err) => {
        expect(err.message).to.equal(
          "Invalid template key 'providers' in configuration for provider 'my-provider'. " +
            "You must specify a provider name as well (e.g. \\${providers.my-provider})."
        )
      }
    )
  })
})
