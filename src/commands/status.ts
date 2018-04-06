/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import { mapValues } from "lodash"
import * as yaml from "js-yaml"
import { Command, EnvironmentOption, ParameterValues } from "./base"
import { GardenContext } from "../context"
import { Service } from "../types/service"
import { highlightYaml } from "../util"

export const options = {
  env: new EnvironmentOption({
    help: "The environment (and optionally namespace) to check",
  }),
}

export type Opts = ParameterValues<typeof options>

export class StatusCommand extends Command<typeof options> {
  name = "status"
  alias = "s"
  help = "Outputs the status of your environment"

  options = options

  async action(ctx: GardenContext, _args, opts: Opts) {
    opts.env && ctx.setEnvironment(opts.env)

    const envStatus = await ctx.getEnvironmentStatus()
    const services = await ctx.getServices()

    const serviceStatus = await Bluebird.props(
      mapValues(services, (service: Service<any>) => ctx.getServiceStatus(service)),
    )

    const status = {
      providers: envStatus,
      services: serviceStatus,
    }
    const yamlStatus = yaml.safeDump(status, { noRefs: true, skipInvalid: true })

    // TODO: do a nicer print of this by default and add --yaml/--json options (maybe globally) for exporting
    ctx.log.info(highlightYaml(yamlStatus))

    return status
  }
}
