/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenContext } from "../context"

export const NEW_MODULE_VERSION = "0000000000"

export abstract class VcsHandler {
  constructor(protected ctx: GardenContext) { }

  abstract async getTreeVersion(directories): Promise<string>
  abstract async sortVersions(versions: string[]): Promise<string[]>
}
