/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import type { ProjectConfig } from "../../../../../src/config/project.js"
import { execa } from "execa"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../../src/constants.js"
import { createProjectConfig, getDataDir, TestGarden } from "../../../../helpers.js"
import { expect } from "chai"
import stripAnsi from "strip-ansi"
import { dedent } from "../../../../../src/util/string.js"
import { TestTask } from "../../../../../src/tasks/test.js"
import fsExtra from "fs-extra"
const { writeFile, remove, pathExists } = fsExtra
import { join } from "path"
import { createGardenPlugin } from "../../../../../src/plugin/plugin.js"
import { convertModules } from "../../../../../src/resolve-module.js"
import { actionFromConfig } from "../../../../../src/graph/actions.js"
import type { TestAction } from "../../../../../src/actions/test.js"

describe("hadolint provider", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let projectConfigFoo: ProjectConfig
  let projectHadolintConfigPath: string

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = tmpDir.path

    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpPath })

    projectConfigFoo = createProjectConfig({
      path: tmpPath,
      providers: [{ name: "hadolint" }],
    })

    projectHadolintConfigPath = join(tmpPath, ".hadolint.yaml")
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  afterEach(async () => {
    if (await pathExists(projectHadolintConfigPath)) {
      await remove(projectHadolintConfigPath)
    }
  })

  // TODO-G2: add a similar test for action-based configs
  it("should add a hadolint Test action for each container module with a Dockerfile", async () => {
    const garden = await TestGarden.factory(tmpPath, {
      plugins: [],
      config: projectConfigFoo,
    })

    garden.setPartialModuleConfigs([
      // With Dockerfile
      {
        apiVersion: GardenApiVersion.v0,
        name: "foo",
        type: "container",
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        path: tmpPath,
        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
        spec: { dockerfile: "foo.Dockerfile" },
      },
      // Without Dockerfile
      {
        apiVersion: GardenApiVersion.v0,
        name: "bar",
        type: "container",
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        path: tmpPath,
        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
        spec: {
          image: "bar:bla",
        },
      },
    ])

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const testAction = graph.getTest("hadolint-foo")

    expect(testAction.sourcePath()).to.equal(tmpPath)
    expect(testAction.getConfig("spec")).to.eql({ dockerfilePath: "foo.Dockerfile" })
    expect(testAction.getConfig().description).to.include("auto-generated")
  })

  // TODO-G2: add a similar test for action-based configs
  it("should add a hadolint Test action for module types inheriting from container", async () => {
    const foo = createGardenPlugin({
      name: "foo",
      dependencies: [{ name: "container" }],
      createModuleTypes: [
        {
          needsBuild: false,
          name: "foo",
          base: "container",
          docs: "foo",
          handlers: {},
        },
      ],
    })

    const garden = await TestGarden.factory(tmpPath, {
      plugins: [foo],
      config: {
        ...projectConfigFoo,
        providers: [...projectConfigFoo.providers, { name: "foo" }],
      },
    })

    garden.setPartialModuleConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "foo",
        type: "foo",
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        path: tmpPath,
        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
        spec: { dockerfile: "foo.Dockerfile" },
      },
    ])

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const testAction = graph.getTest("hadolint-foo")

    expect(testAction.sourcePath()).to.equal(tmpPath)
    expect(testAction.getConfig("spec")).to.eql({ dockerfilePath: "foo.Dockerfile" })
    expect(testAction.getConfig().description).to.include("auto-generated")
  })

  describe("testModule", () => {
    const path = getDataDir("hadolint")

    it("should format warnings and errors nicely", async () => {
      const garden = await TestGarden.factory(tmpPath, {
        plugins: [],
        config: projectConfigFoo,
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "hadolint",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [{ name: "foo", dependencies: [], disabled: false, spec: {}, timeout: 10 }],
          spec: { dockerfilePath: "errAndWarn.Dockerfile" },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("foo")
      const { actions } = await convertModules(garden, garden.log, [module], graph.moduleGraph)
      const action = (await actionFromConfig({
        garden,
        graph,
        config: actions[0],
        log: garden.log,
        configsByKey: {},
        linkedSources: {},
        router: await garden.getActionRouter(),
        mode: "default",
      })) as TestAction

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        force: true,
        forceBuild: false,

        action,
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.include(dedent`
      hadolint reported 1 error(s) and 1 warning(s):

      DL3007: Using latest is prone to errors if the image will ever update. Pin the version explicitly to a release tag
      1:   FROM busybox:latest
      -----^
      DL4000: MAINTAINER is deprecated
      2:   MAINTAINER foo
      -----^
      `)
    })

    it("should prefer a .hadolint.yaml in the module root if it's available", async () => {
      const garden = await TestGarden.factory(tmpPath, {
        plugins: [],
        config: projectConfigFoo,
      })

      // Write a config to the project root, that should _not_ be used in this test
      await writeFile(
        projectHadolintConfigPath,
        dedent`
          ignored:
          - DL4000
        `
      )

      const modulePath = getDataDir("hadolint", "ignore-dl3007")

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "hadolint",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: modulePath,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [{ name: "foo", dependencies: [], disabled: false, spec: {}, timeout: 10 }],
          spec: { dockerfilePath: "errAndWarn.Dockerfile" },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("foo")
      const { actions } = await convertModules(garden, garden.log, [module], graph.moduleGraph)
      const action = (await actionFromConfig({
        garden,
        graph,
        config: actions[0],
        log: garden.log,
        configsByKey: {},
        linkedSources: {},
        router: await garden.getActionRouter(),
        mode: "default",
      })) as TestAction

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.include(dedent`
      hadolint reported 1 error(s):

      DL4000: MAINTAINER is deprecated
      2:   MAINTAINER foo
      -----^
      `)
    })

    it("should use a .hadolint.yaml in the project root if there's none in the module root", async () => {
      const garden = await TestGarden.factory(tmpPath, {
        plugins: [],
        config: projectConfigFoo,
      })

      // Write a config to the project root, that should _not_ be used in this test
      await writeFile(
        projectHadolintConfigPath,
        dedent`
          ignored:
          - DL3007
        `
      )

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "hadolint",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [{ name: "foo", dependencies: [], disabled: false, spec: {}, timeout: 10 }],
          spec: { dockerfilePath: "errAndWarn.Dockerfile" },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("foo")
      const { actions } = await convertModules(garden, garden.log, [module], graph.moduleGraph)
      const action = (await actionFromConfig({
        garden,
        graph,
        config: actions[0],
        log: garden.log,
        configsByKey: {},
        linkedSources: {},
        router: await garden.getActionRouter(),
        mode: "default",
      })) as TestAction

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.include(dedent`
      hadolint reported 1 error(s):

      DL4000: MAINTAINER is deprecated
      2:   MAINTAINER foo
      -----^
      `)
    })

    it("should set success=false with a linting warning if testFailureThreshold=warning", async () => {
      const garden = await TestGarden.factory(tmpPath, {
        plugins: [],
        config: {
          ...projectConfigFoo,
          providers: [{ name: "hadolint", testFailureThreshold: "warning" }],
        },
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "hadolint",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [{ name: "foo", dependencies: [], disabled: false, spec: {}, timeout: 10 }],
          spec: { dockerfilePath: "warn.Dockerfile" },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("foo")
      const { actions } = await convertModules(garden, garden.log, [module], graph.moduleGraph)
      const action = (await actionFromConfig({
        garden,
        graph,
        config: actions[0],
        log: garden.log,
        configsByKey: {},
        linkedSources: {},
        router: await garden.getActionRouter(),
        mode: "default",
      })) as TestAction

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(result).to.exist
      expect(result!.error).to.exist
    })

    it("should set success=true with a linting warning if testFailureThreshold=error", async () => {
      const garden = await TestGarden.factory(tmpPath, {
        plugins: [],
        config: projectConfigFoo,
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "hadolint",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [{ name: "foo", dependencies: [], disabled: false, spec: {}, timeout: 10 }],
          spec: { dockerfilePath: "warn.Dockerfile" },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("foo")
      const { actions } = await convertModules(garden, garden.log, [module], graph.moduleGraph)
      const action = (await actionFromConfig({
        garden,
        graph,
        config: actions[0],
        log: garden.log,
        configsByKey: {},
        linkedSources: {},
        router: await garden.getActionRouter(),
        mode: "default",
      })) as TestAction

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(result).to.exist
      expect(result!.error).to.not.exist
    })

    it("should set success=true with warnings and errors if testFailureThreshold=none", async () => {
      const garden = await TestGarden.factory(tmpPath, {
        plugins: [],
        config: {
          ...projectConfigFoo,
          providers: [{ name: "hadolint", testFailureThreshold: "none" }],
        },
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "hadolint",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [{ name: "foo", dependencies: [], disabled: false, spec: {}, timeout: 10 }],
          spec: { dockerfilePath: "errAndWarn.Dockerfile" },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("foo")
      const { actions } = await convertModules(garden, garden.log, [module], graph.moduleGraph)
      const action = (await actionFromConfig({
        garden,
        graph,
        config: actions[0],
        log: garden.log,
        configsByKey: {},
        linkedSources: {},
        router: await garden.getActionRouter(),
        mode: "default",
      })) as TestAction

      const testTask = new TestTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(result).to.exist
      expect(result!.error).to.not.exist
    })
  })
})
