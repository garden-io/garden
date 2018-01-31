import { Command, ParameterValues, StringParameter } from "../base"
import { GardenContext } from "../../context"

const environmentStatusArgs = {
  environment: new StringParameter({
    help: "The environment (and optionally namespace) to check",
    required: true,
  }),
}

type Args = ParameterValues<typeof environmentStatusArgs>

export class EnvironmentStatusCommand extends Command<typeof environmentStatusArgs> {
  name = "environment status"
  alias = "env status"
  help = "Outputs the status of the specified environment"

  arguments = environmentStatusArgs

  async action(ctx: GardenContext, args: Args) {
    ctx.setEnvironment(args.environment)
    const result = await ctx.getEnvironmentStatus()
    console.log(JSON.stringify(result, null, 4))
    return result
  }
}
