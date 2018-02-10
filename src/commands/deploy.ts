import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import { DeployTask } from "../tasks/deploy"
import { values } from "lodash"
import { Service } from "../types/service"
import chalk from "chalk"

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
    ctx.log.header({ emoji: "rocket", command: "Deploy" })

    ctx.setEnvironment(args.environment)
    const names = args.service ? args.service.split(",") : undefined
    const services = await ctx.getServices(names)

    const result = await deployServices(ctx, values(services), !!opts.force, !!opts["force-build"])

    ctx.log.info({ msg: "" })
    ctx.log.info({ emoji: "heavy_check_mark", msg: chalk.green("Done!\n") })

    return result
  }
}

export async function deployServices(
  ctx: GardenContext,
  services: Service<any>[],
  force: boolean,
  forceBuild: boolean,
) {
  for (const service of services) {
    const task = new DeployTask(ctx, service, force, forceBuild)
    await ctx.addTask(task)
  }

  return await ctx.processTasks()
}
