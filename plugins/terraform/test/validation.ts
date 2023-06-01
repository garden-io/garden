import { makeTestGarden } from "@garden-io/sdk/testing"
import { join } from "path"
import { gardenPlugin } from ".."
import { defaultTerraformVersion } from "../cli"
import { ValidateCommand } from "@garden-io/core/build/src/commands/validate"
import { withDefaultGlobalOpts } from "@garden-io/core/build/test/helpers"

// TODO: re-enable after https://github.com/garden-io/garden/issues/4467 has been fixed
describe.skip("terraform validation", () => {
  for (const project of ["test-project", "test-project-action", "test-project-module"]) {
    it(`should pass validation for ${project}`, async () => {
      const testRoot = join(__dirname, project)
      const garden = await makeTestGarden(testRoot, {
        plugins: [gardenPlugin()],
        variableOverrides: { "tf-version": defaultTerraformVersion },
      })

      const command = new ValidateCommand()
      await command.action({
        garden,
        log: garden.log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })
    })
  }
})
