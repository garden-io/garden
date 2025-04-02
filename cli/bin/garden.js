#!/usr/bin/env node
/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { initTracing } from "@garden-io/core/build/src/util/open-telemetry/tracing.js"
initTracing()

import { runCli } from "../build/src/cli.js"

// This cannot be `await`ed because it somehow then breaks
// the dynamic imports of the plugins
void runCli()

