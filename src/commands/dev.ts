import { Command, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import { join } from "path"
import { STATIC_DIR } from "../constants"
import { spawnSync } from "child_process"
import chalk from "chalk"
import { deployServices } from "./deploy"
import { values } from "lodash"
import { sleep } from "../util"

const imgcatPath = join(__dirname, "..", "..", "bin", "imgcat")
const bannerPath = join(STATIC_DIR, "garden-banner-1-half.png")

const devArgs = {
  environment: new StringParameter({
    help: "The environment (and optionally namespace) to deploy to",
    defaultValue: "local",
  }),
}

type Args = ParameterValues<typeof devArgs>

export class DevCommand extends Command<Args> {
  name = "dev"
  help = "Starts the garden development console"

  arguments = devArgs

  async action(ctx: GardenContext, args: Args) {
    try {
      spawnSync(imgcatPath, [bannerPath], {
        stdio: "inherit",
      })
      console.log()
    } catch (_) {
      // the above fails for terminals other than iTerm2. just ignore the error and move on.
    }

    console.log(chalk.bold(` garden - dev\n`))
    console.log(chalk.gray.italic(` Good afternoon, Jon! Let's get your environment wired up...\n`))

    ctx.setEnvironment(args.environment)

    await ctx.configureEnvironment()

    const services = values(await ctx.getServices())

    await deployServices(ctx, services, false, false)

    ctx.log.info({ msg: "" })
    const watchEntry = ctx.log.info({ emoji: "koala", msg: `Waiting for code changes...` })

    while (true) {
      // TODO: actually do stuff
      await sleep(10000)
      watchEntry.update({ emoji: "koala", msg: `Waiting for code changes...` })
    }
  }
}
