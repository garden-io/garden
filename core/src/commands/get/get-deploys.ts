/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetActionsSubCommand } from "./get-actions-subcommand.js"

export class GetDeploysCommand extends GetActionsSubCommand {
  constructor() {
    super("Deploy")
  }
}
