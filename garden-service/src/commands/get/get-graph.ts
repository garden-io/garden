/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import { RenderedEdge, RenderedNode } from "../../config-graph"
import { highlightYaml } from "../../util/util"
import {
  Command,
  CommandResult,
  CommandParams,
} from "../base"

export interface GraphOutput {
  nodes: RenderedNode[],
  relationships: RenderedEdge[],
}

export class GetGraphCommand extends Command {
  name = "graph"
  help = "Outputs the dependency relationships specified in this project's garden.yml files."

  async action({ garden, log }: CommandParams): Promise<CommandResult<GraphOutput>> {
    const graph = await garden.getConfigGraph()
    const renderedGraph = graph.render()
    const output: GraphOutput = { nodes: renderedGraph.nodes, relationships: renderedGraph.relationships }

    const yamlGraph = yaml.safeDump(renderedGraph, { noRefs: true, skipInvalid: true })

    log.info(highlightYaml(yamlGraph))

    return { result: output }

  }

}
