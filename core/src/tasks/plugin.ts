/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Action } from "../actions/types.js"
import type { ValidResultType } from "../tasks/base.js"
import { BaseActionTask, BaseTask } from "../tasks/base.js"
import { Profile } from "../util/profiling.js"

@Profile()
export abstract class PluginTask extends BaseTask {
  type = "plugin"
}

@Profile()
export abstract class PluginActionTask<
  T extends Action,
  O extends ValidResultType = ValidResultType,
> extends BaseActionTask<T, O> {
  readonly type = "plugin"
}
