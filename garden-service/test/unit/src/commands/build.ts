import { BuildCommand } from "../../../../src/commands/build"
import { expect } from "chai"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"
import { taskResultOutputs } from "../../../helpers"

describe("BuildCommand", () => {
  it("should build all modules in a project", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ watch: false, force: true }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "stage-build.module-a": {},
      "stage-build.module-b": {},
      "stage-build.module-c": {},
    })
  })

  it("should optionally build single module and its dependencies", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { modules: ["module-b"] },
      opts: withDefaultGlobalOpts({ watch: false, force: true }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
    })
  })

  it("should be protected", async () => {
    const command = new BuildCommand()
    expect(command.protected).to.be.true
  })

  it("should skip disabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ watch: false, force: true }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
    })
  })

  it("should build disabled modules if they are dependencies of enabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    await garden.scanModules()
    // module-b is a build dependency of module-c
    garden["moduleConfigs"]["module-b"].disabled = true

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ watch: false, force: true }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "stage-build.module-a": {},
      "stage-build.module-b": {},
      "stage-build.module-c": {},
    })
  })
})
