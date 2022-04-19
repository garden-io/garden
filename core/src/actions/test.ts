/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseRuntimeActionSpec, baseRuntimeActionSpec, BaseActionWrapper } from "./base"

export interface TestActionSpec extends BaseRuntimeActionSpec {
  kind: "Test"
}

export const testActionSpec = () => baseRuntimeActionSpec()

export class TestActionWrapper<S extends BaseRuntimeActionSpec> extends BaseActionWrapper<S> {}
