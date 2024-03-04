/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { IntegerParameter, StringsParameter } from "../cli/params.js"

export const defaultServerPort = 9777
export const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the server to listen on (defaults to ${defaultServerPort} if available).`,
  }),
  cmd: new StringsParameter({ help: "(Only used by dev command for now)", hidden: true }),
}
export const serveArgs = {}
