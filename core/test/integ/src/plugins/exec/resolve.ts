import { expect } from "chai"
import execa from "execa"
import { remove, readFile } from "fs-extra"
import { join } from "node:path"
import { getDataDir, makeTestGarden, TestGarden } from "../../../../helpers"

describe("exec provider initialization cache behaviour", () => {
  let gardenOne: TestGarden
  let tmpDir: string

  beforeEach(async () => {
    gardenOne = await makeTestGarden(getDataDir("exec-provider-cache"), { environmentName: "one" })
    tmpDir = await gardenOne.getRepoRoot()
  })

  it("writes the environment name to theFile as configured in the initScript", async () => {
    await gardenOne.resolveProvider(gardenOne.log, "exec")

    const contents = await readFile(join(tmpDir, "theFile"), { encoding: "utf-8" })

    expect(contents).equal("one\n")
  })

  it("overwrites theFile when changing environments", async () => {
    await gardenOne.resolveProvider(gardenOne.log, "exec")

    let contents = await readFile(join(tmpDir, "theFile"), { encoding: "utf-8" })
    expect(contents).equal("one\n")

    const gardenTwo = await makeTestGarden(tmpDir, { environmentName: "two", noTempDir: true })
    await gardenTwo.resolveProvider(gardenTwo.log, "exec")

    contents = await readFile(join(tmpDir, "theFile"), { encoding: "utf-8" })
    expect(contents).equal("two\n")
  })

  it("still overwrites theFile when changing environments back", async () => {
    await gardenOne.resolveProvider(gardenOne.log, "exec")

    let contents = await readFile(join(tmpDir, "theFile"), { encoding: "utf-8" })
    expect(contents).equal("one\n")

    const gardenTwo = await makeTestGarden(tmpDir, { environmentName: "two", noTempDir: true })
    await gardenTwo.resolveProvider(gardenTwo.log, "exec")

    contents = await readFile(join(tmpDir, "theFile"), { encoding: "utf-8" })
    expect(contents).equal("two\n")

    const gardenOneAgain = await makeTestGarden(tmpDir, { environmentName: "one", noTempDir: true })
    await gardenOneAgain.resolveProvider(gardenOneAgain.log, "exec")

    contents = await readFile(join(tmpDir, "theFile"), { encoding: "utf-8" })
    expect(contents).equal("one\n")
  })
})
