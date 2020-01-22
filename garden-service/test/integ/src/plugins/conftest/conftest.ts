import { ProjectConfig } from "../../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { Garden } from "../../../../../src/garden"
import { getDataDir } from "../../../../helpers"
import { expect } from "chai"
import stripAnsi from "strip-ansi"
import { dedent } from "../../../../../src/util/string"
import { TestTask } from "../../../../../src/tasks/test"

describe("conftest provider", () => {
  const projectRoot = getDataDir("test-projects", "conftest")
  const projectConfig: ProjectConfig = {
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: projectRoot,
    defaultEnvironment: "default",
    dotIgnoreFiles: [],
    environments: [{ name: "default", variables: {} }],
    providers: [{ name: "conftest", policyPath: "policy.rego" }],
    variables: {},
  }

  describe("testModule", () => {
    it("should format warnings and errors nicely", async () => {
      const garden = await Garden.factory(projectRoot, {
        plugins: [],
        config: projectConfig,
      })

      const graph = await garden.getConfigGraph(garden.log)
      const module = await graph.getModule("warn-and-fail")

      const testTask = new TestTask({
        garden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0],
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      const key = testTask.getKey()
      const { [key]: result } = await garden.processTasks([testTask])

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.equal(dedent`
      conftest reported 1 failure(s) and 1 warning(s):

      FAIL - warn-and-fail.yaml - shouldDefinitelyNotBeTrue must be false
      WARN - warn-and-fail.yaml - shouldBeTrue should be true
      `)
    })

    it("should set success=false with a linting warning if testFailureThreshold=warn", async () => {
      const garden = await Garden.factory(projectRoot, {
        plugins: [],
        config: {
          ...projectConfig,
          providers: [{ name: "conftest", policyPath: "policy.rego", testFailureThreshold: "warn" }],
        },
      })

      const graph = await garden.getConfigGraph(garden.log)
      const module = await graph.getModule("warn")

      const testTask = new TestTask({
        garden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0],
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      const key = testTask.getKey()
      const { [key]: result } = await garden.processTasks([testTask])

      expect(result).to.exist
      expect(result!.error).to.exist
    })

    it("should set success=true with a linting warning if testFailureThreshold=error", async () => {
      const garden = await Garden.factory(projectRoot, {
        plugins: [],
        config: projectConfig,
      })

      const graph = await garden.getConfigGraph(garden.log)
      const module = await graph.getModule("warn")

      const testTask = new TestTask({
        garden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0],
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      const key = testTask.getKey()
      const { [key]: result } = await garden.processTasks([testTask])

      expect(result).to.exist
      expect(result!.error).to.not.exist
    })

    it("should set success=true with warnings and errors if testFailureThreshold=none", async () => {
      const garden = await Garden.factory(projectRoot, {
        plugins: [],
        config: {
          ...projectConfig,
          providers: [{ name: "conftest", policyPath: "policy.rego", testFailureThreshold: "none" }],
        },
      })

      const graph = await garden.getConfigGraph(garden.log)
      const module = await graph.getModule("warn-and-fail")

      const testTask = new TestTask({
        garden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0],
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      const key = testTask.getKey()
      const { [key]: result } = await garden.processTasks([testTask])

      expect(result).to.exist
      expect(result!.error).to.not.exist
    })
  })
})
