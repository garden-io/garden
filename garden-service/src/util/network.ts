/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _getPort from "get-port"
import { omit } from "lodash"

export async function getPort(options?: _getPort.Options) {
  try {
    return await _getPort(options)
  } catch (error) {
    if (error.code === "EACCES") {
      // Upstream library doesn't handle errors where a port is free but we're not allowed to listen on it.
      // Fall back to using a random port.
      return _getPort(omit(options, "port"))
    } else {
      throw error
    }
  }
}
