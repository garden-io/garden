import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import { DeployTask } from "../tasks/deploy"
import { values } from "lodash"

const deployArgs = {
  environment: new StringParameter({
    help: "The environment (and optionally namespace) to deploy to",
    required: true,
  }),
  service: new StringParameter({
    help: "The name of the service(s) to deploy (skip to deploy all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

const deployOpts = {
  force: new BooleanParameter({ help: "Force redeploy of service(s)" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)" }),
}

type Args = ParameterValues<typeof deployArgs>
type Opts = ParameterValues<typeof deployOpts>

export class DeployCommand extends Command<typeof deployArgs, typeof deployOpts> {
  name = "deploy"
  help = "Deploy service(s) to the specified environment"

  arguments = deployArgs
  options = deployOpts

  async action(ctx: GardenContext, args: Args, opts: Opts) {
    ctx.setEnvironment(args.environment)

    const names = args.service ? args.service.split(",") : undefined
    const services = await ctx.getServices(names)

    for (const service of values(services)) {
      const task = new DeployTask(ctx, service, opts.force, opts["force-build"])
      await ctx.addTask(task)
    }

    return await ctx.processTasks()
  }
}
