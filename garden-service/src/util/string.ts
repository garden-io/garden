/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _dedent = require("dedent")
import _deline = require("deline")

// Exporting these here for convenience and ease of imports (otherwise we need to require modules instead of using
// the import syntax, and it for some reason doesn't play nice with IDEs).
export const dedent = _dedent
export const deline = _deline
