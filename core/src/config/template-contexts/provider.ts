/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { PrimitiveMap, joiIdentifierMap, joiPrimitive, DeepPrimitiveMap } from "../common"
import { Provider, GenericProviderConfig, ProviderMap } from "../provider"
import { Garden } from "../../garden"
import { joi } from "../common"
import { deline } from "../../util/string"
import { getProviderUrl } from "../../docs/common"
import { ConfigContext, schema } from "./base"
import { WorkflowConfigContext } from "./workflow"

class ProviderContext extends ConfigContext {
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
  public config: GenericProviderConfig

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
  public outputs: PrimitiveMap

  constructor(root: ConfigContext, provider: Provider) {
    super(root)
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
  public providers: Map<string, ProviderContext>

  constructor(garden: Garden, resolvedProviders: ProviderMap, variables: DeepPrimitiveMap) {
    super(garden, variables)

    this.providers = new Map(Object.entries(mapValues(resolvedProviders, (p) => new ProviderContext(this, p))))
  }
}
