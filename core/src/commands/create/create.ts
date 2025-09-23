/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { CreateProjectCommand } from "./create-project.js"
import { CreateCloudVariablesCommand } from "./create-cloud-variables.js"

export class CreateCommand extends CommandGroup {
  name = "create"
  help = "Create resources, e.g. remote variables, projects, etc."

  subCommands = [CreateProjectCommand, CreateCloudVariablesCommand]
}
