/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Stream } from "ts-stream"
import { actionParamsSchema, PluginDeployActionParamsBase } from "../../base"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"
import { DeployAction } from "../../../actions/deploy"
import { ServiceLogEntry } from "../../../types/service"
import { ActionTypeHandlerSpec } from "../base/base"
import { Resolved } from "../../../actions/base"

interface GetDeployLogsParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  stream: Stream<ServiceLogEntry>
  follow: boolean
  tail?: number
  since?: string
  startTime?: Date
}

export class GetDeployLogs<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  GetDeployLogsParams<Resolved<T>>,
  {}
> {
  description = dedent`
    Retrieve a stream of logs for the specified deployment, optionally waiting for new logs.

    Note that when not listening for new logs, all logs are loaded into memory and sorted. The plugin handler should therefore take care to set a sensible limit on the number of log lines retrieved.

    Called by the \`garden logs\` command.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      stream: joi.object().description("A Stream object, to write the logs to."),
      follow: joi.boolean().description("Whether to keep listening for logs until aborted."),
      since: joi.string().description(`Only return logs newer than a relative duration like 5s, 2m, or 3h.`),
      tail: joi
        .number()
        .optional()
        .description(
          "Number of lines to get from end of log. Defaults to showing all log lines (up to a certain limit) if not defined."
        ),
      startTime: joi.date().optional().description("If set, only return logs that are as new or newer than this date."),
    })

  resultSchema = () => joi.object().keys({})
}
