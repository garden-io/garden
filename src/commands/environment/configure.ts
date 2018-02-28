import { Command, EnvironmentOption, ParameterValues } from "../base"
import { GardenContext } from "../../context"

const options = {
  env: new EnvironmentOption({
    help: "Set the environment (and optionally namespace) to configure",
  }),
}

type Opts = ParameterValues<typeof options>

export class EnvironmentConfigureCommand extends Command<typeof options> {
  name = "environment configure"
  alias = "env configure"
  help = "Configures your environment"

  options = options

  async action(ctx: GardenContext, _args, opts: Opts) {
    ctx.log.header({ emoji: "gear", command: `Configuring ${opts.env} environment` })
    opts.env && ctx.setEnvironment(opts.env)

    const result = await ctx.configureEnvironment()

    ctx.log.info({ msg: "" })
    ctx.log.header({ emoji: "heavy_check_mark", command: `Done!` })

    return result
  }
}
