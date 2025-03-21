/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import stripAnsi from "strip-ansi"
import { dirname, join } from "node:path"

import { dedent } from "@garden-io/sdk/build/src/util/string.js"
import { defaultNamespace } from "@garden-io/sdk/build/src/constants.js"
import { gardenPlugin } from "../src/index.js"
import type { ProjectConfig } from "@garden-io/sdk/build/src/types.js"
import { makeTestGarden } from "@garden-io/sdk/build/src/testing.js"

import { TestTask } from "@garden-io/core/build/src/tasks/test.js"
import { defaultDotIgnoreFile } from "@garden-io/core/build/src/util/fs.js"
import { GardenApiVersion } from "@garden-io/core/build/src/constants.js"
import { fileURLToPath } from "node:url"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

describe("conftest provider", () => {
  const projectRoot = join(moduleDirName, "test-project")

  const projectConfig: ProjectConfig = {
    apiVersion: GardenApiVersion.v2,
    kind: "Project",
    name: "test",
    path: projectRoot,
    internal: {
      basePath: projectRoot,
    },
    defaultEnvironment: "default",
    dotIgnoreFile: defaultDotIgnoreFile,
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "conftest", policyPath: "policy.rego" }],
    variables: {},
  }

  describe.skip("testModule", () => {
    it("should format warnings and errors nicely", async () => {
      const garden = await makeTestGarden(projectRoot, {
        plugins: [gardenPlugin()],
        config: projectConfig,
      })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getTest("warn-and-fail")

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const key = testTask.getKey()
      const res = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const result = res.results[key]

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.equal(dedent`
      conftest reported 1 failure(s) and 1 warning(s):

      FAIL - warn-and-fail.yaml - shouldDefinitelyNotBeTrue must be false
      WARN - warn-and-fail.yaml - shouldBeTrue should be true
      `)
    })

    it("should set success=false with a linting warning if testFailureThreshold=warn", async () => {
      const garden = await makeTestGarden(projectRoot, {
        plugins: [gardenPlugin()],
        config: {
          ...projectConfig,
          providers: [{ name: "conftest", policyPath: "policy.rego", testFailureThreshold: "warn" }],
        },
      })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getTest("warn")

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const key = testTask.getKey()
      const res = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const result = res.results[key]

      expect(result).to.exist
      expect(result!.error).to.exist
    })

    it("should set success=true with a linting warning if testFailureThreshold=error", async () => {
      const garden = await makeTestGarden(projectRoot, {
        plugins: [gardenPlugin()],
        config: projectConfig,
      })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getTest("warn")

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const key = testTask.getKey()
      const res = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const result = res.results[key]

      expect(result).to.exist
      expect(result!.error).to.not.exist
    })

    it("should set success=true with warnings and errors if testFailureThreshold=none", async () => {
      const garden = await makeTestGarden(projectRoot, {
        plugins: [gardenPlugin()],
        config: {
          ...projectConfig,
          providers: [{ name: "conftest", policyPath: "policy.rego", testFailureThreshold: "none" }],
        },
      })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getTest("warn-and-fail")

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const key = testTask.getKey()
      const res = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const result = res.results[key]

      expect(result).to.exist
      expect(result!.error).to.not.exist
    })
  })
})
