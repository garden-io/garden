import { Command, EnvironmentOption, ParameterValues, StringParameter } from "../base"
import { GardenContext } from "../../context"

const configSetArgs = {
  key: new StringParameter({
    help: "The key of the configuration variable. Separate with dots to set a nested key (e.g. key.nested)",
    required: true,
  }),
  value: new StringParameter({
    help: "The value of the configuration variable",
    required: true,
  }),
}

const configSetOpts = {
  env: new EnvironmentOption({
    help: "Set the environment (and optionally namespace) where the config should be stored",
  }),
}

type SetArgs = ParameterValues<typeof configSetArgs>
type SetOpts = ParameterValues<typeof configSetOpts>

// TODO: allow reading key/value pairs from a file

export class ConfigSetCommand extends Command<typeof configSetArgs, typeof configSetOpts> {
  name = "set"
  help = "Set a configuration variable"

  arguments = configSetArgs
  options = configSetOpts

  async action(ctx: GardenContext, args: SetArgs, opts: SetOpts) {
    opts.env && ctx.setEnvironment(opts.env)
    await ctx.setConfig(args.key.split("."), args.value)
    ctx.log.info({ msg: `Set config key ${args.key}` })
    return { ok: true }
  }
}
