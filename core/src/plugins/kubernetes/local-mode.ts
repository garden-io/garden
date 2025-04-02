/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerLocalModeSchema } from "../container/config.js"

import { joi } from "../../config/common.js"

export const kubernetesLocalModeSchema = () =>
  containerLocalModeSchema().keys({
    target: joi
      .object()
      .keys({
        kind: joi.string().optional().meta({ internal: true }),
        name: joi.string().optional().meta({ internal: true }),
        podSelector: joi.string().optional().meta({ internal: true }),
        containerName: joi.string().optional().meta({ internal: true }),
      })
      .meta({ internal: true }),
  })
