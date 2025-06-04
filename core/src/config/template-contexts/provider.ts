/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash-es"
import type { PrimitiveMap } from "../common.js"
import { joiIdentifierMap, joiPrimitive } from "../common.js"
import type { BaseProviderConfig, Provider, ProviderMap } from "../provider.js"
import type { Garden } from "../../garden.js"
import { joi } from "../common.js"
import { deline } from "../../util/string.js"
import { getProviderUrl } from "../../docs/common.js"
import { ContextWithSchema, schema } from "./base.js"
import { WorkflowConfigContext } from "./workflow.js"
import type { VariablesContext } from "./variables.js"

class ProviderContext extends ContextWithSchema {
  @schema(
    joi
      .object()
      .pattern(
        /.*/,
        joiPrimitive().description(
          deline`
          The provider config key value. Refer to individual [provider references](${getProviderUrl()}) for details.
          `
        )
      )
      .description("The resolved configuration for the provider.")
      .example({ clusterHostname: "my-cluster.example.com" })
      .meta({ keyPlaceholder: "<config-key>" })
  )
  public config: BaseProviderConfig

  @schema(
    joiIdentifierMap(
      joiPrimitive().description(
        deline`
        The provider output value. Refer to individual [provider references](${getProviderUrl()}) for details.
        `
      )
    )
      .description("The outputs defined by the provider (see individual plugin docs for details).")
      .example({ "cluster-ip": "1.2.3.4" })
      .meta({ keyPlaceholder: "<output-key>" })
  )
  public readonly outputs: PrimitiveMap

  constructor(provider: Provider) {
    super()
    this.config = provider.config
    this.outputs = provider.status.outputs
  }
}

export class ProviderConfigContext extends WorkflowConfigContext {
  @schema(
    joiIdentifierMap(ProviderContext.getSchema())
      .description("Retrieve information about providers that are defined in the project.")
      .meta({ keyPlaceholder: "<provider-name>" })
  )
  public readonly providers: Map<string, ProviderContext>

  constructor(garden: Garden, resolvedProviders: ProviderMap, variables: VariablesContext) {
    super(garden, variables)

    this.providers = new Map(Object.entries(mapValues(resolvedProviders, (p) => new ProviderContext(p))))
  }
}
