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
      version: "0",
      name: "test-project-a",
      defaultEnvironment: "local",
      global: {
        variables: { some: "variable" },
      },
      environments: {
        local: {
          providers: {
            "test-plugin": {},
            "test-plugin-b": {},
          },
          variables: {},
        },
        other: { variables: {} },
      },
    })
  })

  it("should load and parse a module config", async () => {
    const parsed = await loadConfig(projectPathA, modulePathA)

    expect(parsed.module).to.eql({
      name: "module-a",
      type: "generic",
      allowPush: true,
      services: { "service-a": { dependencies: [] } },
      build: { command: "echo A", dependencies: [] },
      test: {
        unit: {
          command: ["echo", "OK"],
          dependencies: [],
          variables: {},
        },
      },
      path: modulePathA,
      variables: {},
    })
  })
})
