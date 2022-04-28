/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseRuntimeActionConfig, baseRuntimeActionConfig, Action } from "./base"

export interface DeployActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"deploy", N, S> {
  type: N
}

export const deployActionSpec = () => baseRuntimeActionConfig()

export class DeployAction<S extends DeployActionConfig = any, O extends {} = any> extends Action<S, O> {}
