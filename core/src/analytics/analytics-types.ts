/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type AnalyticsEventType =
  | "Run Command"
  | "Command Result"
  | "Call API"
  | "Module Configuration Error"
  | "Project Configuration Error"
  | "Validation Error"

export type AnalyticsCommandResult = "failure" | "success"
