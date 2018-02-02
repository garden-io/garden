import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import { BuildTask } from "../tasks/build"
import { values } from "lodash"

const buildArguments = {
  module: new StringParameter({
    help: "Specify module(s) to build. Use comma separator to specify multiple modules.",
  }),
}

const buildOptions = {
  force: new BooleanParameter({ help: "Force rebuild of module(s)" }),
}

type BuildArguments = ParameterValues<typeof buildArguments>
type BuildOptions = ParameterValues<typeof buildOptions>

export class BuildCommand extends Command<typeof buildArguments, typeof buildOptions> {
  name = "build"
  help = "Build your modules"

  arguments = buildArguments
  options = buildOptions

  async action(ctx: GardenContext, args: BuildArguments, opts: BuildOptions) {
    const names = args.module ? args.module.split(",") : undefined
    const modules = await ctx.getModules(names)

    for (const module of values(modules)) {
      const task = new BuildTask(module, opts.force)
      await ctx.addTask(task)
    }

    ctx.log.header({ emoji: "hammer", command: "build" })

    return await ctx.processTasks()
  }
}
