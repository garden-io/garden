/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export enum AnalyticsType {
  COMMAND = "Run Command",
  COMMAND_RESULT = "Run Command Result",
  CALL_API = "Call API",
  MODULE_CONFIG_ERROR = "Module Configuration Error",
  PROJECT_CONFIG_ERROR = "Project Configuration Error",
  VALIDATION_ERROR = "Validation Error",
}

export enum AnalyticsCommandResult {
  FAILURE = "failure",
  SUCCESS = "success",
}
