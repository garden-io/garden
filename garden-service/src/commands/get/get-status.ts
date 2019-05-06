/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deepFilter } from "../../util/util"
import {
  Command,
  CommandResult,
  CommandParams,
} from "../base"
import { EnvironmentStatus } from "../../actions"

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the status of your environment."

  async action({ garden, log }: CommandParams): Promise<CommandResult<EnvironmentStatus>> {
    const status = await garden.actions.getStatus({ log })

    // TODO: we should change the status format because this will remove services called "detail"
    const withoutDetail = deepFilter(status, (_, key) => key !== "detail")

    // TODO: do a nicer print of this by default
    log.info({ data: withoutDetail })

    return { result: status }
  }
}
