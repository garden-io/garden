import { expect } from "chai"
import { flatten, keys, mapValues, values, uniq } from "lodash"
import { join } from "path"
import {
  AutoReloadDependants,
  autoReloadModules,
  computeAutoReloadDependants,
} from "../../src/watch"
import { makeTestGarden } from "../helpers"
import { inspect } from "util"

const projectRoot = join(__dirname, "..", "data", "test-project-auto-reload")

export function dependantModuleNames(ard: AutoReloadDependants): { [key: string]: string[] } {
  return mapValues(ard, dependants => {
    return Array.from(dependants).map(d => d.name)
  })
}

describe("watch", () => {
  describe("autoReloadModules", () => {
    it("should include build and service dependencies of requested modules", async () => {
      const ctx = (await makeTestGarden(projectRoot)).pluginContext
      const moduleNames = (await autoReloadModules(await ctx.getModules(["module-e", "module-d"])))
        .map(m => m.name).sort()

      expect(moduleNames).to.eql(["module-a", "module-b", "module-c", "module-d", "module-e"])
    })
  })

  describe("computeAutoReloadDependants", () => {
    it("should include build and service dependants of requested modules", async () => {
      const ctx = (await makeTestGarden(projectRoot)).pluginContext
      const dependants = dependantModuleNames(
        await computeAutoReloadDependants(ctx))

      expect(dependants).to.eql({
        "module-a": [ "module-b" ],
        "module-b": [ "module-d", "module-e" ],
        "module-c": [ "module-e", "module-f" ],
      })
    })
  })
})
