/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import {
  detectCycles,
  detectMissingDependencies,
  DependencyValidationGraph,
} from "../../../../src/util/validate-dependencies"
import { makeTestGarden, dataDir, expectError } from "../../../helpers"
import { ModuleConfig } from "../../../../src/config/module"
import { ConfigurationError } from "../../../../src/exceptions"
import { Garden } from "../../../../src/garden"
import { flatten } from "lodash"

/**
 * Here, we cast the garden arg to any in order to access the private moduleConfigs property.
 *
 * We also ignore any exeptions thrown by scanModules, because we want to more granularly
 * test the validation methods below (which normally throw their exceptions during the
 * execution of scanModules).
 */
async function scanAndGetConfigs(garden: Garden) {
  const moduleConfigs: ModuleConfig[] = await garden["resolveModuleConfigs"](garden.log)

  const serviceNames = flatten(moduleConfigs.map((m) => m.serviceConfigs.map((s) => s.name)))
  const taskNames = flatten(moduleConfigs.map((m) => m.taskConfigs.map((s) => s.name)))

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

  describe("DependencyValidationGraph", () => {
    describe("detectCircularDependencies", () => {
      it("should return an empty cycle array when no nodes or dependencies have been added", async () => {
        const validationGraph = new DependencyValidationGraph()
        const cycles = validationGraph.detectCircularDependencies()
        expect(cycles).to.be.empty
      })

      it("should return a cycle when circular dependencies have been added", async () => {
        const vg = new DependencyValidationGraph()
        vg.addNode("a")
        vg.addNode("b")
        vg.addNode("c")
        vg.addDependency("b", "a")
        vg.addDependency("c", "b")
        vg.addDependency("a", "c")
        const cycles = vg.detectCircularDependencies()
        expect(cycles).to.eql([["a", "c", "b"]])
      })

      it("should return null when no circular dependencies have been added", async () => {
        const vg = new DependencyValidationGraph()
        vg.addNode("a")
        vg.addNode("b")
        vg.addNode("c")
        vg.addDependency("b", "a")
        vg.addDependency("c", "b")
        vg.addDependency("c", "a")
        const cycles = vg.detectCircularDependencies()
        expect(cycles).to.be.empty
      })

      it("should return an error when circular config dependencies are present", async () => {
        const circularProjectRoot = join(dataDir, "test-project-circular-deps")
        const garden = await makeTestGarden(circularProjectRoot)
        // This implicitly tests detectCircularDependencies, since that method is called in ConfigGraph's constructor.
        await expectError(
          () => garden.getConfigGraph(garden.log),
          (e) => expect(e).to.be.instanceOf(ConfigurationError)
        )
      })

      it("should return null when no circular config dependencies are present", async () => {
        const nonCircularProjectRoot = join(dataDir, "test-project-b")
        const garden = await makeTestGarden(nonCircularProjectRoot)
        const configGraph = await garden.getConfigGraph(garden.log)
        const validationGraph = DependencyValidationGraph.fromDependencyGraph(configGraph["dependencyGraph"])
        const cycles = validationGraph.detectCircularDependencies()
        expect(cycles).to.be.empty
      })
    })

    describe("overallOrder", () => {
      it("should return the overall dependency order when circular dependencies are present", async () => {
        const vg = new DependencyValidationGraph()
        vg.addNode("a")
        vg.addNode("b")
        vg.addNode("c")
        vg.addNode("d")
        vg.addDependency("b", "a")
        vg.addDependency("c", "b")
        vg.addDependency("c", "a")
        vg.addDependency("d", "c")
        expect(vg.overallOrder()).to.eql(["a", "b", "c", "d"])
      })

      it("should throw an error when circular dependencies are present", async () => {
        const vg = new DependencyValidationGraph()
        vg.addNode("a")
        vg.addNode("b")
        vg.addNode("c")
        vg.addDependency("b", "a")
        vg.addDependency("c", "b")
        vg.addDependency("a", "c")
        await expectError(
          () => vg.overallOrder(),
          (e) => expect(e).to.be.instanceOf(ConfigurationError)
        )
      })
    })
  })

  describe("detectCycles", () => {
    it("should detect self-to-self cycles", () => {
      const cycles = detectCycles([{ from: "a", to: "a" }])

      expect(cycles).to.deep.eq([["a"]])
    })

    it("should preserve dependency order when returning cycles", () => {
      const cycles = detectCycles([
        { from: "foo", to: "bar" },
        { from: "bar", to: "baz" },
        { from: "baz", to: "foo" },
      ])

      expect(cycles).to.deep.eq([["foo", "bar", "baz"]])
    })
  })
})
