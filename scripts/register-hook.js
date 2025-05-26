/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// We need this file to work around a problem with ts-node and ESM modules.
// Node is then run with `node --import ./scripts/register-hook.js`
// See https://github.com/TypeStrong/ts-node/issues/1997#issuecomment-1794664958 for details.

import { pathToFileURL, fileURLToPath } from "node:url"
import { register } from "node:module"

const filename = fileURLToPath(import.meta.url)
register("ts-node/esm", pathToFileURL(filename))
