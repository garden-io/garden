/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployActionSpec } from "../../../actions/deploy"
import { actionParamsSchema, PluginDeployActionParamsBase } from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { serviceStatusSchema } from "../../../types/service"

export interface DeleteDeployParams<T extends DeployActionSpec = DeployActionSpec>
  extends PluginDeployActionParamsBase<T> {}

export const deleteDeploy = () => ({
  description: dedent`
    Terminate a deployed service. This should wait until the service is no longer running.

    Called by the \`garden delete service\` command.
  `,
  paramsSchema: actionParamsSchema(),
  resultSchema: serviceStatusSchema(),
})
