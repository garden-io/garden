/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RenderedEdge, RenderedNode } from "../../graph/config-graph"
import { printHeader } from "../../logger/util"
import { Command, CommandResult, CommandParams } from "../base"

export interface GraphOutput {
  nodes: RenderedNode[]
  relationships: RenderedEdge[]
}

export class GetGraphCommand extends Command {
  name = "graph"
  help = "Outputs the dependency relationships specified in this project's garden.yml files."

  printHeader({ headerLog }) {
    printHeader(headerLog, "Get graph", "chart_with_upwards_trend")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult<GraphOutput>> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const renderedGraph = graph.render()
    const output: GraphOutput = {
      nodes: renderedGraph.nodes,
      relationships: renderedGraph.relationships,
    }

    log.info({ data: renderedGraph })

    return { result: output }
  }
}
