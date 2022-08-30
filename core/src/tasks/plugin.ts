/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Action } from "../actions/types"
import { BaseActionTask, BaseTask, ValidResultType } from "../tasks/base"
import { Profile } from "../util/profiling"

@Profile()
export abstract class PluginTask extends BaseTask {
  type = "plugin"
}

@Profile()
export abstract class PluginActionTask<
  T extends Action,
  O extends ValidResultType = ValidResultType,
  S extends ValidResultType = O
> extends BaseActionTask<T, O, S> {
  type = "plugin"
}
