import { expect } from "chai"

import { TestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { getHelmTestGarden } from "./common"
import { TestTask } from "../../../../../../src/tasks/test"
import { findByName } from "../../../../../../src/util/util"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"

describe("testHelmModule", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  it("should run a basic test", async () => {
    const module = await graph.getModule("artifacts")

    const testTask = new TestTask({
      garden,
      graph,
      module,
      testConfig: findByName(module.testConfigs, "echo-test")!,
      log: garden.log,
      force: true,
      forceBuild: false,
      version: module.version,
      _guard: true,
    })

    const key = testTask.getKey()
    const { [key]: result } = await garden.processTasks([testTask], { throwOnError: true })

    expect(result).to.exist
    expect(result).to.have.property("output")
    expect(result!.output.log.trim()).to.equal("ok")
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const module = await graph.getModule("artifacts")

      const testTask = new TestTask({
        garden,
        graph,
        module,
        testConfig: findByName(module.testConfigs, "artifacts-test")!,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
    })

    it("should handle globs when copying artifacts out of the container", async () => {
      const module = await graph.getModule("artifacts")

      const testTask = new TestTask({
        garden,
        graph,
        module,
        testConfig: findByName(module.testConfigs, "globs-test")!,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })
  })
})
