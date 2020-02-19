/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Axios from "axios"
import { bootstrap } from "global-agent"

// Handle proxy environment settings
// (see https://github.com/gajus/global-agent#what-is-the-reason-global-agentbootstrap-does-not-use-http_proxy)
bootstrap({
  environmentVariableNamespace: "",
  forceGlobalAgent: true,
})

// Exporting from here to make sure the global-agent bootstrap is executed
export const axios = Axios
