import { Command, ParameterValues, StringParameter } from "../base"
import { GardenContext } from "../../context"

const envConfigureArgs = {
  environment: new StringParameter({
    help: "The environment (and optionally namespace) to configure",
    required: true,
  }),
}

type Args = ParameterValues<typeof envConfigureArgs>

export class EnvironmentConfigureCommand extends Command<typeof envConfigureArgs> {
  name = "environment configure"
  alias = "env configure"
  help = "Outputs the status of the specified environment"

  arguments = envConfigureArgs

  async action(ctx: GardenContext, args: Args) {
    ctx.log.header({ emoji: "gear", command: `Configuring ${args.environment} environment` })
    ctx.setEnvironment(args.environment)
    const result = await ctx.configureEnvironment()
    ctx.log.header({ emoji: "heavy_check_mark", command: `Done!` })
    return result
  }
}
