import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import { ParameterError } from "../exceptions"
import { BuildTask } from "../tasks/build"
import { Module } from "../types/module"

const buildArguments = {
  module: new StringParameter({ help: "Specify module to build" }),
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
    const modules = await ctx.getModules()

    const addTask = async (module: Module) => {
      const task = new BuildTask(module, opts.force)
      await ctx.addTask(task)
    }

    if (args.module) {
      let found = false

      for (const key of Object.keys(modules)) {
        if (key === args.module) {
          found = true
          await addTask(modules[key])
          break
        }
      }

      if (!found) {
        throw new ParameterError(`Could not find module ${args.module}`, {})
      }
    } else {
      for (const key of Object.keys(modules)) {
        await addTask(modules[key])
      }
    }

    return await ctx.processTasks()
  }
}
