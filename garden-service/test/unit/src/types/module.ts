import { expect } from "chai"
import { getDataDir, makeTestGarden } from "../../../helpers"

describe("moduleFromConfig", () => {
  it("should add module config file to version files if needed", async () => {
    const projectRoot = await getDataDir("test-projects", "include-field")
    const garden = await makeTestGarden(projectRoot)
    const graph = await garden.getConfigGraph()
    const module = await graph.getModule("module-a")

    expect(module.version.files).to.include(module.configPath)
  })
})
