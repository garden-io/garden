/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerLocalModeSchema } from "../container/config.js"

import { targetResourceSpecSchema } from "./config.js"

export const kubernetesLocalModeSchema = () =>
  containerLocalModeSchema()
    .keys({
      target: targetResourceSpecSchema().description(
        "The remote Kubernetes resource to proxy traffic from. If specified, this is used instead of `defaultTarget`."
      ),
    })
    .description(`This feature has been deleted.`)
