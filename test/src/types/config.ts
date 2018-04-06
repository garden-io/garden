import { expect } from "chai"
import { loadConfig } from "../../../src/types/config"
import { resolve } from "path"
import { dataDir } from "../../helpers"

const projectPathA = resolve(dataDir, "test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

describe("loadConfig", () => {
  // TODO: test more cases + error cases
  it("should load and parse a project config", async () => {
    const parsed = await loadConfig(projectPathA)

    expect(parsed.project).to.eql({
      name: "build-test-project",
      environments: {
        local: {
          providers: {
            test: {
              type: "test-plugin",
            },
            "test-b": {
              type: "test-plugin-b",
            },
          },
        },
        other: {},
      },
      variables: { some: "variable" },
      version: "0",
      defaultEnvironment: "local",
    })
  })

  it("should load and parse a module config", async () => {
    const parsed = await loadConfig(modulePathA)

    expect(parsed.module).to.eql({
      name: "module-a",
      type: "generic",
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
