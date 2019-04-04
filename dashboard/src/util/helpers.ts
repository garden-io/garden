/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten } from "lodash"
import { ModuleConfig } from "../api/types"

export function getServiceNames(moduleConfigs: ModuleConfig[]) {
  return flatten(moduleConfigs.map(m => m.serviceConfigs.map(s => s.name)))
}

export function getEmojiByType(type: string) : string{
  switch (type) {
    case "deploy":
      return "🚀";
    case "build":
      return "🔧";
    case "integ":
    case "unit":
    case "test (integ)":
    case "test (unit)":
      return "✅";
    case "task":
      return "🏃";
    default:
      return "";
  }
}