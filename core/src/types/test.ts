/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenModule } from "./module"
import { TestConfig, testConfigSchema } from "../config/test"
import { getEntityVersion } from "../vcs/vcs"
import { findByName } from "../util/util"
import { NotFoundError } from "../exceptions"
import { joi, joiUserIdentifier, versionStringSchema } from "../config/common"

export interface GardenTest<M extends GardenModule = GardenModule> {
  name: string
  module: M
  disabled: boolean
  config: M["testConfigs"][0]
  spec: M["testConfigs"][0]["spec"]
  version: string
}

export const testSchema = () =>
  joi
    .object()
    .options({ presence: "required" })
    .keys({
      name: joiUserIdentifier().description("The name of the test."),
      module: joi.object().unknown(true), // This causes a stack overflow: joi.lazy(() => moduleSchema()),
      disabled: joi.boolean().default(false).description("Set to true if the test is disabled."),
      config: testConfigSchema(),
      spec: joi.object().description("The raw configuration of the test (specific to each plugin)."),
      version: versionStringSchema().description("The version of the test."),
    })

export function testFromConfig<M extends GardenModule = GardenModule>(module: M, config: TestConfig): GardenTest<M> {
  return {
    name: config.name,
    module,
    disabled: module.disabled || config.disabled,
    config,
    spec: config.spec,
    version: getEntityVersion(module, config),
  }
}

export function testFromModule<M extends GardenModule = GardenModule>(module: M, name: string): GardenTest<M> {
  const config = findByName(module.testConfigs, name)

  if (!config) {
    throw new NotFoundError(`Could not find test ${name} in module ${module.name}`, { module, name })
  }

  return testFromConfig(module, config)
}
