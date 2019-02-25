import { expect } from "chai"
import { ProviderConfig, getProviderDependencies } from "../../../src/config/provider"
import { expectError } from "../../helpers"

describe("getProviderDependencies", () => {
  it("should extract implicit provider dependencies from template strings", async () => {
    const config: ProviderConfig = {
      name: "my-provider",
      someKey: "\${provider.other-provider.foo}",
      anotherKey: "foo-\${provider.another-provider.bar}",
    }
    expect(await getProviderDependencies(config)).to.eql([
      "another-provider",
      "other-provider",
    ])
  })

  it("should ignore template strings that don't reference providers", async () => {
    const config: ProviderConfig = {
      name: "my-provider",
      someKey: "\${provider.other-provider.foo}",
      anotherKey: "foo-\${some.other.ref}",
    }
    expect(await getProviderDependencies(config)).to.eql([
      "other-provider",
    ])
  })

  it("should throw on provider-scoped template strings without a provider name", async () => {
    const config: ProviderConfig = {
      name: "my-provider",
      someKey: "\${provider}",
    }

    await expectError(
      () => getProviderDependencies(config),
      (err) => {
        expect(err.message).to.equal(
          "Invalid template key 'provider' in configuration for provider 'my-provider'. " +
          "You must specify a provider name as well (e.g. \\\${provider.my-provider}).",
        )
      },
    )
  })
})
