import { expect } from "chai"
import { mapValues } from "lodash"
import { join } from "path"
import {
  AutoReloadDependants,
  computeAutoReloadDependants,
} from "../../src/watch"
import { makeTestGarden } from "../helpers"

export function dependantModuleNames(ard: AutoReloadDependants): { [key: string]: string[] } {
  return mapValues(ard, dependants => {
    return Array.from(dependants).map(d => d.name).sort()
  })
}

describe("watch", () => {

  describe("computeAutoReloadDependants", () => {
    it("should include build and service dependants of requested modules", async () => {
      const projectRoot = join(__dirname, "..", "data", "test-project-auto-reload")
      const garden = await makeTestGarden(projectRoot)
      const dependants = dependantModuleNames(
        await computeAutoReloadDependants(garden))

      expect(dependants).to.eql({
        "module-a": ["module-b"],
        "module-b": ["module-d", "module-e"],
        "module-c": ["module-e", "module-f"],
      })
    })
  })

})
