/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { expect } from "chai"
import { DockerComposeProvider, gardenPlugin as dockerComposePlugin } from "../src"
import { ActionRouter } from "@garden-io/core/build/src/router/router"
import { ResolvedConfigGraph } from "@garden-io/core/src/graph/config-graph"
import { makeTestGarden } from "@garden-io/core/build/test/helpers"
import { sdk } from "@garden-io/sdk"

const testRoot = join(__dirname, "test-project")

describe("Docker Compose plugin handlers", () => {
  let garden: sdk.testing.TestGarden
  let log: sdk.types.Log
  let ctx: sdk.types.PluginContext
  let provider: DockerComposeProvider
  let resolvedGraph: ResolvedConfigGraph
  let router: ActionRouter

  before(async () => {
    garden = await makeTestGarden(testRoot, {
      plugins: [dockerComposePlugin],
      forceRefresh: true,
    })
    log = garden.log
    resolvedGraph = await garden.getResolvedConfigGraph({ log, emit: false })
    router = await garden.getActionRouter()
    provider = (await garden.resolveProvider(log, "docker-compose")) as DockerComposeProvider
    ctx = await garden.getPluginContext({ provider, events: undefined, templateContext: undefined })
  })

  describe("augmentGraph", async () => {
    it("should create a Build and Deploy action for each service in a Docker Compose project", async () => {
      const buildActions = resolvedGraph.getActionsByKind("Build")
      const deployActions = resolvedGraph.getActionsByKind("Deploy")
      expect(buildActions.map((a) => a.name).sort()).to.eql(["wesb-compose"])
      expect(deployActions.map((a) => a.name).sort()).to.eql(["redis-compose", "web-compose"])
    })
  })

  describe("build", () => {
    it("should build the Docker image for a Compose service", async () => {
      const buildTask = new sdk.testing.BuildTask({
        garden,
        log,
        graph: resolvedGraph,
        action: resolvedGraph.getBuild("web-compose"),
        force: true,
      })
      const res = await garden.processTasks({ tasks: [buildTask], throwOnError: true })
      const buildResult = res.results.getResult(buildTask)
      expect(buildResult?.result?.detail?.buildLog).to.match(/load build definition from Dockerfile/)
    })
  })

  describe("deploy", () => {
    it("should deploy a Compose service to the local Docker daemon", async () => {
      const deployTask = new sdk.testing.DeployTask({
        garden,
        log,
        graph: resolvedGraph,
        action: resolvedGraph.getDeploy("web-compose"),
        force: true,
      })
      const res = await garden.processTasks({ tasks: [deployTask], throwOnError: true })
      const deployResult = res.results.getResult(deployTask)
      expect(deployResult?.result?.state === "ready").to.be.true
    })
  })

  describe("delete", () => {
    it("should delete a running Compose service from the local Docker daemon", async () => {
      const deploy = resolvedGraph.getDeploy("web-compose")
      const deployTask = new sdk.testing.DeployTask({
        garden,
        log,
        graph: resolvedGraph,
        action: deploy,
        force: false,
      })
      await garden.processTasks({ tasks: [deployTask], throwOnError: true })
      await router.deleteDeploys({ graph: resolvedGraph, log, names: [deploy.name] })
      const status = await router.deploy.getStatus({
        graph: resolvedGraph,
        action: deploy,
        log: deploy.createLog(log),
      })
      expect(status.result.state).to.eql("not-ready")
    })
  })

  describe("docker-compose-exec actions", () => {
    const deployName = "web-compose"
    afterEach(async () => {
      await router.deleteDeploys({ graph: resolvedGraph, log, names: [deployName] })
    })
    describe("Run", () => {
      it("should execute the specified command in an already-running container", async () => {
        const action = resolvedGraph.getRun("web-exec-echo-env")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask], throwOnError: true })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.result?.detail?.log).to.match(/WIZARD=gandalf/)
      })

      it("should return an error if the command failed inside the container", async () => {
        const action = resolvedGraph.getRun("web-exec-bork")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask] })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.error).to.exist
      })
    })

    describe("Test", () => {
      it("should execute the specified command in an already-running container", async () => {
        const action = resolvedGraph.getTest("web-exec-echo")
        const runTask = new sdk.testing.TestTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask], throwOnError: true })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.result?.detail?.log).to.match(/Hello Compose!/)
      })
    })
  })

  describe("docker-compose-run actions", () => {
    describe("Run", () => {
      it("should execute the specified command in a fresh container", async () => {
        const action = resolvedGraph.getRun("web-run-echo-env")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask], throwOnError: true })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.result?.detail?.log).to.match(/Hello gandalf/)
      })

      it("should return an error if the command failed inside the container", async () => {
        const action = resolvedGraph.getRun("web-run-bork")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask] })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.error).to.exist
      })
    })

    describe("Test", () => {
      it("should execute the specified command in a fresh container", async () => {
        const action = resolvedGraph.getTest("web-run-echo")
        const runTask = new sdk.testing.TestTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask], throwOnError: true })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.result?.detail?.log).to.match(/Hello Compose!/)
      })
    })
  })

  describe("docker-run actions", () => {
    describe("Run", () => {
      it("should execute the specified command in a fresh container", async () => {
        const action = resolvedGraph.getRun("docker-run-echo")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask], throwOnError: true })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.result?.detail?.log).to.match(/Hello Compose!/)
      })

      it("should return an error if the command failed inside the container", async () => {
        const action = resolvedGraph.getRun("docker-run-bork")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask] })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.error).to.exist
      })
    })

    describe("Test", () => {
      it("should execute the specified command in a fresh container", async () => {
        const action = resolvedGraph.getRun("docker-run-echo")
        const runTask = new sdk.testing.RunTask({
          garden,
          graph: resolvedGraph,
          action,
          log,
          force: false,
          forceBuild: false,
        })
        const res = await garden.processTasks({ tasks: [runTask], throwOnError: true })
        const runResult = res.results.getResult(runTask)
        expect(runResult?.result?.detail?.log).to.match(/Hello Compose!/)
      })
    })
  })
})
