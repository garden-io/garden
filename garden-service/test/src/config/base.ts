import { expect } from "chai"
import { loadConfig } from "../../../src/config/base"
import { resolve } from "path"
import { dataDir } from "../../helpers"

const projectPathA = resolve(dataDir, "test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

describe("loadConfig", async () => {

  // TODO: test more cases + error cases
  it("should load and parse a project config", async () => {
    const parsed = await loadConfig(projectPathA, projectPathA)

    expect(parsed!.project).to.eql({
      name: "test-project-a",
      defaultEnvironment: "local",
      sources: [],
      environmentDefaults: {
        providers: [],
        variables: { some: "variable" },
      },
      environments: [
        {
          name: "local",
          providers: [
            { name: "test-plugin" },
            { name: "test-plugin-b" },
          ],
          variables: {},
        },
        {
          name: "other",
          providers: [],
          variables: {},
        },
      ],
    })
  })

  it("should load and parse a module config", async () => {
    const parsed = await loadConfig(projectPathA, modulePathA)

    expect(parsed!.module).to.eql({
      name: "module-a",
      type: "test",
      description: undefined,
      repositoryUrl: undefined,
      allowPublish: true,
      build: { command: ["echo", "A"], dependencies: [] },
      path: modulePathA,
      variables: {},

      spec: {
        services: [{ name: "service-a" }],
        tasks: [{
          name: "workflow-a",
          command: ["echo", "OK"],
        }],
        tests: [{
          name: "unit",
          command: ["echo", "OK"],
        }],
      },

      serviceConfigs: [],
      workflowConfigs: [],
      testConfigs: [],
    })
  })

  it("should return undefined if config file is not found", async () => {
    const parsed = await loadConfig("/thisdoesnotexist", "/thisdoesnotexist")
    expect(parsed).to.be.undefined
  })

})
