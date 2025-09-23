/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { detectCycles, DependencyGraph } from "../../../../src/graph/common.js"
import { makeTestGarden, expectError, getDataDir } from "../../../helpers.js"
import type { ModuleConfig } from "../../../../src/config/module.js"
import { ConfigurationError } from "../../../../src/exceptions.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
  GardenApiVersion,
} from "../../../../src/constants.js"
import { detectMissingDependencies } from "../../../../src/graph/modules.js"

describe("graph common", () => {
  describe("detectMissingDependencies", () => {
    it("should return an error when a build dependency is missing", async () => {
      const moduleConfigs: ModuleConfig[] = [
        {
          apiVersion: GardenApiVersion.v0,
          name: "test",
          type: "test",
          allowPublish: false,
          build: { dependencies: [{ name: "missing", copy: [] }], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: "/tmp",
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ]
      expect(() => detectMissingDependencies({ moduleConfigs })).to.throw()
    })

    it("should return an error when a service dependency is missing", async () => {
      const moduleConfigs: ModuleConfig[] = [
        {
          apiVersion: GardenApiVersion.v0,
          name: "test",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: "/tmp",
          serviceConfigs: [
            {
              name: "test",
              dependencies: ["missing"],
              disabled: false,

              spec: {},
            },
          ],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ]
      expect(() => detectMissingDependencies({ moduleConfigs })).to.throw()
    })

    it("should return an error when a task dependency is missing", async () => {
      const moduleConfigs: ModuleConfig[] = [
        {
          apiVersion: GardenApiVersion.v0,
          name: "test",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: "/tmp",
          serviceConfigs: [],
          taskConfigs: [
            {
              name: "test",
              cacheResult: true,
              dependencies: ["missing"],
              disabled: false,
              spec: {},
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
            },
          ],
          testConfigs: [],
          spec: {},
        },
      ]
      expect(() => detectMissingDependencies({ moduleConfigs })).to.throw()
    })

    it("should return an error when a test dependency is missing", async () => {
      const moduleConfigs: ModuleConfig[] = [
        {
          apiVersion: GardenApiVersion.v0,
          name: "test",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: "/tmp",
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [
            {
              name: "test",
              dependencies: ["missing"],
              disabled: false,
              spec: {},
              timeout: DEFAULT_TEST_TIMEOUT_SEC,
            },
          ],
          spec: {},
        },
      ]
      expect(() => detectMissingDependencies({ moduleConfigs })).to.throw()
    })

    it("should return null when no dependencies are missing", async () => {
      const moduleConfigs: ModuleConfig[] = [
        {
          apiVersion: GardenApiVersion.v0,
          name: "test",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: "/tmp",
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ]
      expect(() => detectMissingDependencies({ moduleConfigs })).to.not.throw
    })
  })

  describe("DependencyValidationGraph", () => {
    describe("detectCircularDependencies", () => {
      it("should return an empty cycle array when no nodes or dependencies have been added", async () => {
        const validationGraph = new DependencyGraph()
        const cycles = validationGraph.detectCircularDependencies()
        expect(cycles).to.be.empty
      })

      it("should return a cycle when circular dependencies have been added", async () => {
        const vg = new DependencyGraph()
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
        const vg = new DependencyGraph()
        vg.addNode("a")
        vg.addNode("b")
        vg.addNode("c")
        vg.addDependency("b", "a")
        vg.addDependency("c", "b")
        vg.addDependency("c", "a")
        const cycles = vg.detectCircularDependencies()
        expect(cycles).to.be.empty
      })

      it("should return null when no circular config dependencies are present", async () => {
        const nonCircularProjectRoot = getDataDir("test-project-b")
        const garden = await makeTestGarden(nonCircularProjectRoot)
        const configGraph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const validationGraph = DependencyGraph.fromGraphNodes(configGraph["dependencyGraph"])
        const cycles = validationGraph.detectCircularDependencies()
        expect(cycles).to.be.empty
      })
    })

    describe("overallOrder", () => {
      it("should return the overall dependency order when circular dependencies are present", async () => {
        const vg = new DependencyGraph()
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
        const vg = new DependencyGraph()
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
