import { expect } from "chai"
import { containerHelpers as helpers } from "../../../../../src/plugins/container/helpers"

describe("plugins.container", () => {
  describe("getDockerVersion", () => {
    it("should get the current docker version", async () => {
      const { clientVersion, serverVersion } = await helpers.getDockerVersion()
      expect(clientVersion).to.be.ok
      expect(serverVersion).to.be.ok
    })
  })
})
