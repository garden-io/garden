import { expect } from "chai"
import { join } from "path"
import {
  detectCycles,
  detectMissingDependencies,
  detectCircularDependencies,
} from "../../../src/util/validate-dependencies"
import { makeTestGarden, dataDir } from "../../helpers"
import { ModuleConfig } from "../../../src/config/module"
import { ConfigurationError } from "../../../src/exceptions"
import { Garden } from "../../../src/garden"
import { flatten } from "lodash"

/**
 * Here, we cast the garden arg to any in order to access the private moduleConfigs property.
 *
 * We also ignore any exeptions thrown by scanModules, because we want to more granularly
 * test the validation methods below (which normally throw their exceptions during the
 * execution of scanModules).
 */
async function scanAndGetConfigs(garden: Garden) {
  const moduleConfigs: ModuleConfig[] = await garden.resolveModuleConfigs()
  const serviceNames = flatten(moduleConfigs.map(m => m.serviceConfigs.map(s => s.name)))
  const taskNames = flatten(moduleConfigs.map(m => m.taskConfigs.map(s => s.name)))

  return {
    moduleConfigs,
    serviceNames,
    taskNames,
  }
}

describe("validate-dependencies", () => {
  describe("detectMissingDependencies", () => {
    it("should return an error when a build dependency is missing", async () => {
      const projectRoot = join(dataDir, "test-projects", "missing-deps", "missing-build-dep")
      const garden = await makeTestGarden(projectRoot)
      const { moduleConfigs, serviceNames, taskNames } = await scanAndGetConfigs(garden)
      const err = detectMissingDependencies(moduleConfigs, serviceNames, taskNames)
      expect(err).to.be.an.instanceOf(ConfigurationError)
    })

    it("should return an error when a runtime dependency is missing", async () => {
      const projectRoot = join(dataDir, "test-projects", "missing-deps", "missing-runtime-dep")
      const garden = await makeTestGarden(projectRoot)
      const { moduleConfigs, serviceNames, taskNames } = await scanAndGetConfigs(garden)
      const err = detectMissingDependencies(moduleConfigs, serviceNames, taskNames)
      expect(err).to.be.an.instanceOf(ConfigurationError)
    })

    it("should return null when no dependencies are missing", async () => {
      const projectRoot = join(dataDir, "test-project-b")
      const garden = await makeTestGarden(projectRoot)
      const { moduleConfigs, serviceNames, taskNames } = await scanAndGetConfigs(garden)
      const err = detectMissingDependencies(moduleConfigs, serviceNames, taskNames)
      expect(err).to.eql(null)
    })
  })

  describe("detectCircularDependencies", () => {
    it("should return an error when circular dependencies are present", async () => {
      const circularProjectRoot = join(dataDir, "test-project-circular-deps")
      const garden = await makeTestGarden(circularProjectRoot)
      const { moduleConfigs } = await scanAndGetConfigs(garden)
      const err = detectCircularDependencies(moduleConfigs)
      expect(err).to.be.an.instanceOf(ConfigurationError)
    })

    it("should return null when no circular dependencies are present", async () => {
      const nonCircularProjectRoot = join(dataDir, "test-project-b")
      const garden = await makeTestGarden(nonCircularProjectRoot)
      const { moduleConfigs } = await scanAndGetConfigs(garden)
      const err = detectCircularDependencies(moduleConfigs)
      expect(err).to.eql(null)
    })
  })

  describe("detectCycles", () => {
    it("should detect self-to-self cycles", () => {
      const cycles = detectCycles({
        a: { a: { distance: 1, next: "a" } },
      }, ["a"])

      expect(cycles).to.deep.eq([["a"]])
    })

    it("should preserve dependency order when returning cycles", () => {
      const cycles = detectCycles({
        foo: { bar: { distance: 1, next: "bar" } },
        bar: { baz: { distance: 1, next: "baz" } },
        baz: { foo: { distance: 1, next: "foo" } },
      }, ["foo", "bar", "baz"])

      expect(cycles).to.deep.eq([["foo", "bar", "baz"]])
    })
  })
})
