/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten } from "lodash";
import { ModuleConfig } from "../api/types";

export function getServiceNames(moduleConfigs: ModuleConfig[]) {
  return flatten(moduleConfigs.map(m => m.serviceConfigs.map(s => s.name)));
}

export function getIconClassNameByType(type: string): string {
  switch (type) {
    case "deploy":
      return "deploy";
    case "build":
      return "build";
    case "integ":
    case "unit":
    case "test (integ)":
    case "test (unit)":
      return "test";
    case "task":
    case "run":
      return "task";
    default:
      return "";
  }
}

export function timeConversion(millisec) {
  var seconds = +(millisec / 1000).toFixed(1);
  var minutes = +(millisec / (1000 * 60)).toFixed(1);
  var hours = +(millisec / (1000 * 60 * 60)).toFixed(1);
  var days = +(millisec / (1000 * 60 * 60 * 24)).toFixed(1);
  let formatTime = (num, prefix) => `${num} ${prefix}`
  let timeFormatted: string | null = null;
  if (seconds < 60) {
    timeFormatted = formatTime(seconds, "Sec");
  } else if (minutes < 60) {
    timeFormatted = formatTime(minutes, "Min");
  } else if (hours < 24) {
    timeFormatted = formatTime(hours, "Hrs");
  } else {
    timeFormatted = formatTime(days, "Days");
  }

  return timeFormatted;
}
