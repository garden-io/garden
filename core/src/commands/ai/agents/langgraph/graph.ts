/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { StateGraph, START, END } from "@langchain/langgraph"
import { NODE_NAMES, type AgentContext } from "../../types.js"
import { MainAgentNode } from "./nodes/main-agent-node.js"
import { ProjectExplorerNode } from "./nodes/project-explorer-node.js"
import { KubernetesAgentNode } from "./nodes/kubernetes-agent-node.js"
// import { DockerAgentNode } from "./nodes/docker-agent-node.js"
import { GardenAgentNode } from "./nodes/garden-agent-node.js"
// import { TerraformAgentNode } from "./nodes/terraform-agent-node.js"
import { HumanInTheLoopNode } from "./nodes/human-in-the-loop-node.js"
import { StateAnnotation } from "./types.js"

/**
 * Creates the LangGraph agent network
 */
export function createAgentGraph(context: AgentContext) {
  // Initialize all nodes
  const mainAgentNode = new MainAgentNode(context)
  const projectExplorerNode = new ProjectExplorerNode(context)
  const kubernetesAgentNode = new KubernetesAgentNode(context)
  // const dockerAgentNode = new DockerAgentNode(context)
  const gardenAgentNode = new GardenAgentNode(context)
  // const terraformAgentNode = new TerraormAgentNode(context)
  const humanInTheLoopNode = new HumanInTheLoopNode(context)

  mainAgentNode.addAvailableNodes([projectExplorerNode, kubernetesAgentNode, gardenAgentNode, humanInTheLoopNode])
  projectExplorerNode.addAvailableNodes([humanInTheLoopNode])
  kubernetesAgentNode.addAvailableNodes([humanInTheLoopNode])
  gardenAgentNode.addAvailableNodes([humanInTheLoopNode, kubernetesAgentNode])

  // Create the state graph
  const workflow = new StateGraph(StateAnnotation)
    .addNode(NODE_NAMES.MAIN_AGENT, mainAgentNode.makeNode({ endNodeName: END }), mainAgentNode.getNodeOptions())
    .addNode(
      NODE_NAMES.HUMAN_LOOP,
      // TODO: human in the loop node should always go to the node that referred to it, not the main agent
      humanInTheLoopNode.makeNode({ endNodeName: NODE_NAMES.MAIN_AGENT }),
      humanInTheLoopNode.getNodeOptions()
    )
    .addNode(
      NODE_NAMES.PROJECT_EXPLORER,
      projectExplorerNode.makeNode({ endNodeName: NODE_NAMES.MAIN_AGENT }),
      projectExplorerNode.getNodeOptions()
    )
    .addNode(
      NODE_NAMES.KUBERNETES_AGENT,
      kubernetesAgentNode.makeNode({ endNodeName: NODE_NAMES.MAIN_AGENT }),
      kubernetesAgentNode.getNodeOptions()
    )
    // .addNode(NODE_NAMES.DOCKER_AGENT, async (state: typeof GraphStateAnnotation.State) => {
    //   return await dockerAgentNode.process({ ...state, context })
    // })
    .addNode(
      NODE_NAMES.GARDEN_AGENT,
      gardenAgentNode.makeNode({ endNodeName: NODE_NAMES.MAIN_AGENT }),
      gardenAgentNode.getNodeOptions()
    )
    // Start with main agent
    .addEdge(START, NODE_NAMES.MAIN_AGENT)

  // .addNode(NODE_NAMES.TERRAFORM_AGENT, async (state: typeof GraphStateAnnotation.State) => {
  //   return await terraformAgentNode.process({ ...state, context })
  // })

  // From human-in-the-loop -> main agent (if user continues) or END (if user exits)
  // workflow.addConditionalEdges(NODE_NAMES.HUMAN_LOOP, (state) => {
  //   if (state.userFeedback === "quit") {
  //     return END
  //   }
  //   return NODE_NAMES.MAIN_AGENT
  // })

  // // Main agent decides whether to explore or select experts
  // workflow.addConditionalEdges(NODE_NAMES.MAIN_AGENT, (state) => {
  //   if (state.shouldExplore) {
  //     return NODE_NAMES.PROJECT_EXPLORER
  //   }
  //   if (state.expertsToConsult && state.expertsToConsult.length > 0) {
  //     // Route to the first expert
  //     const expertName = state.expertsToConsult[0].toLowerCase().replace("agent", "")
  //     switch (expertName) {
  //       case "kubernetes":
  //         return NODE_NAMES.KUBERNETES_AGENT
  //       // case "docker":
  //       //   return NODE_NAMES.DOCKER_AGENT
  //       case "garden":
  //         return NODE_NAMES.GARDEN_AGENT
  //       // case "terraform":
  //       //   return NODE_NAMES.TERRAFORM_AGENT
  //       default:
  //         return NODE_NAMES.RESPONSE_SYNTHESIZER
  //     }
  //   }
  //   return NODE_NAMES.RESPONSE_SYNTHESIZER
  // })

  // expertNodes.forEach((node) => {
  //   workflow.addConditionalEdges(node, (state) => {
  //     if (!state.expertsToConsult || state.expertsToConsult.length === 0) {
  //       return NODE_NAMES.RESPONSE_SYNTHESIZER
  //     }

  //     const currentExpertName = expertAgentMappings[node]
  //     const currentIndex = state.expertsToConsult.findIndex((e) => e === currentExpertName)

  //     if (currentIndex === -1 || currentIndex === state.expertsToConsult.length - 1) {
  //       return NODE_NAMES.RESPONSE_SYNTHESIZER
  //     }

  //     // Route to the next expert
  //     const nextExpert = state.expertsToConsult[currentIndex + 1]
  //     const nextExpertName = nextExpert.toLowerCase().replace("agent", "")

  //     switch (nextExpertName) {
  //       case "kubernetes":
  //         return NODE_NAMES.KUBERNETES_AGENT
  //       // case "docker":
  //       //   return NODE_NAMES.DOCKER_AGENT
  //       case "garden":
  //         return NODE_NAMES.GARDEN_AGENT
  //       // case "terraform":
  //       //   return NODE_NAMES.TERRAFORM_AGENT
  //       default:
  //         return NODE_NAMES.RESPONSE_SYNTHESIZER
  //     }
  //   })
  // })

  // Response synthesizer -> back to human-in-the-loop
  // workflow.addEdge(NODE_NAMES.RESPONSE_SYNTHESIZER, NODE_NAMES.HUMAN_LOOP)

  // Compile the graph
  const graph = workflow.compile()

  return graph
}
