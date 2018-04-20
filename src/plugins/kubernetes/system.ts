/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { STATIC_DIR } from "../../constants"
import { Garden } from "../../garden"
import { PluginContext } from "../../plugin-context"
import { Environment } from "../../types/common"

export const GARDEN_SYSTEM_NAMESPACE = "garden-system"
export const localIngressPort = 32000

const systemProjectPath = join(STATIC_DIR, "kubernetes", "system")
const systemSymbol = Symbol()

export function isSystemGarden(ctx: PluginContext): boolean {
  return ctx.config.providers.kubernetes!._system === systemSymbol
}

export async function getSystemGarden(appEnv: Environment): Promise<Garden> {
  const context = appEnv.config.providers.kubernetes!.context

  return Garden.factory(systemProjectPath, {
    env: "default",
    config: {
      version: "0",
      project: {
        name: "garden-system",
        defaultEnvironment: "default",
        environments: {
          default: {
            providers: {
              kubernetes: {
                context,
                _system: systemSymbol,
              },
            },
          },
        },
      },
    },
  })
}
