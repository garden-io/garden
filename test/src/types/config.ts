import { expect } from "chai"
import { loadConfig } from "../../../src/types/config"
import { resolve } from "path"
import { dataDir } from "../../helpers"

const projectPathA = resolve(dataDir, "test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

describe("loadConfig", () => {
  // TODO: test more cases + error cases
  it("should load and parse a project config", async () => {
    const parsed = await loadConfig(projectPathA, projectPathA)

    expect(parsed.project).to.eql({
      name: "test-project-a",
      defaultEnvironment: "local",
      global: {
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

    expect(parsed.module).to.eql({
      name: "module-a",
      type: "generic",
      allowPush: true,
      services: [{ name: "service-a", dependencies: [] }],
      build: { command: "echo A", dependencies: [] },
      test: [{
        name: "unit",
        command: ["echo", "OK"],
        dependencies: [],
        variables: {},
      }],
      path: modulePathA,
      variables: {},
    })
  })
})
