/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, projectActionParamsSchema } from "../../base"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"
import { NamespaceStatus, namespaceStatusesSchema } from "../../../types/namespace"

export interface CleanupEnvironmentParams extends PluginActionParamsBase {}

export interface CleanupEnvironmentResult {
  namespaceStatuses?: NamespaceStatus[]
}

export const cleanupEnvironment = () => ({
  description: dedent`
    Clean up any runtime components, services etc. that this plugin has deployed in the environment.

    Like \`prepareEnvironment\`, this is executed sequentially, so handlers are allowed to request user input
    if necessary.

    Called by the \`garden delete environment\` command.
  `,
  paramsSchema: projectActionParamsSchema(),
  resultSchema: joi.object().keys({ namespaceStatuses: namespaceStatusesSchema().optional() }),
})
