/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Writer } from "./base.js"

/**
 * The QuietWriter doesn't write any log lines as the name suggests.
 * We still implement it as actual class since that's simpler then special
 * casing it elsewhere in the code.
 */
export class QuietWriter extends Writer {
  type = "quiet"

  write() {
    // no-op
  }
}
