/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GenericModuleHandler } from "./generic"

export class NpmPackageModuleHandler extends GenericModuleHandler {
  name = "npm-package-module"
  supportedModuleTypes = ["npm-package"]

  // TODO: check package.json
  // parseModule(module: Module) {
  // }
}
