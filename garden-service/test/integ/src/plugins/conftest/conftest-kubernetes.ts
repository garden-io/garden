import { Garden } from "../../../../../src/garden"
import { getDataDir } from "../../../../helpers"
import { expect } from "chai"
import stripAnsi = require("strip-ansi")
import { dedent } from "../../../../../src/util/string"
import { TestTask } from "../../../../../src/tasks/test"

describe("conftest-kubernetes provider", () => {
  const projectRoot = getDataDir("test-projects", "conftest-kubernetes")

  it("should add a conftest module for each helm module", async () => {
    const garden = await Garden.factory(projectRoot)

    const graph = await garden.getConfigGraph(garden.log)
    const helmModule = await graph.getModule("helm")
    const module = await graph.getModule("conftest-helm")

    expect(module.path).to.equal(helmModule.path)
    expect(module.spec).to.eql({
      build: { dependencies: [] },
      files: [".rendered.yaml"],
      namespace: "main",
      policyPath: "../custom-policy",
      sourceModule: "helm",
    })
  })

  it("should add a conftest module for each kubernetes module", async () => {
    const garden = await Garden.factory(projectRoot)

    const graph = await garden.getConfigGraph(garden.log)
    const kubernetesModule = await graph.getModule("kubernetes")
    const module = await graph.getModule("conftest-kubernetes")

    expect(module.path).to.equal(kubernetesModule.path)
    expect(module.spec).to.eql({
      build: { dependencies: [] },
      files: kubernetesModule.spec.files,
      namespace: "main",
      policyPath: "../custom-policy",
      sourceModule: "kubernetes",
    })
  })

  describe("testModule", () => {
    it("should be able to test files in a remote Helm chart", async () => {
      const garden = await Garden.factory(projectRoot)

      const graph = await garden.getConfigGraph(garden.log)
      const module = await graph.getModule("conftest-helm")

      const testTask = new TestTask({
        garden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0],
        force: true,
        forceBuild: true,
        version: module.version,
        _guard: true,
      })

      const key = testTask.getKey()
      const { [key]: result } = await garden.processTasks([testTask])

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.equal(dedent`
      conftest reported 1 failure(s):

      FAIL - .rendered.yaml - StatefulSet replicas should not be 1
      `)
    })
  })
})
