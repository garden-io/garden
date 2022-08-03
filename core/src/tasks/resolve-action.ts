/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseActionTask, ActionTaskProcessParams, ActionTaskStatusParams } from "./base"
import { Profile } from "../util/profiling"
import { Action, Resolved } from "../actions/base"

export interface ResolveActionResults<T extends Action> {
  outputs: {
    resolvedAction: Resolved<T>
  }
}

@Profile()
export class ResolveActionTask<T extends Action> extends BaseActionTask<T, ResolveActionResults<T>> {
  type = "resolve-action"

  getDescription() {
    return `resolving ${this.action.longDescription()}`
  }

  async getStatus({}: ActionTaskStatusParams<T>) {
    return null
  }

  async process({ dependencyResults }: ActionTaskProcessParams<T, ResolveActionResults<T>): Promise<ResolveActionResults<T>> {
    // TODO-G2: resolve the action
    
    const resolvedAction = this.action.resolve({ dependencyResults })

    return {
      outputs: {
        resolvedAction,
      },
    }
  }
}
