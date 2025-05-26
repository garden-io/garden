/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { local } from "@pulumi/command"

const script = new local.Command("runLocalScript", {
  create: "echo 'Deploy script for deploy-b'",
})

export const scriptOutput = script.stdout
