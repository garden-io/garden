/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion"
import { Canvas, Node, Edge, MarkerArrow, NodeChildProps } from "reaflow"
import React, { useState } from "react"
import styled from "@emotion/styled"
import { capitalize } from "lodash"
import Card from "../card"
import "./graph.scss"
import { colors, fontMedium } from "../../styles/variables"
import Spinner, { SpinnerProps } from "../spinner"
import { SelectGraphNode, StackGraphSupportedFilterKeys } from "../../contexts/ui"
import { FiltersButton, Filters } from "../group-filter"
import { GraphOutputWithNodeStatus, StackGraphNode } from "../../containers/graph"
import { getTextWidth } from "../../util/helpers"

interface Node {
  id: string
  height: number
  width: number
  data: StackGraphNode
}

interface Edge {
  id: string
  from: string
  to: string
  type: string
  // since?: number
}

export interface Graph {
  nodes: Node[]
  edges: Edge[]
}

const selectedClassName = "selected"

const Span = styled.span`
  margin-left: 1rem;
`

const Status = styled.p`
  ${fontMedium}
  color: grey;
`

const ProcessSpinner = styled<any, SpinnerProps>(Spinner)`
  margin: 16px 0 0 20px;
`

const defaultTaskIndicator = "—"
const nodeMinWidth = 90
// Note: These values are needed to compute the desired dimensions of each node
const nodeTextSizePx = 15
const nodeTextSpacingPx = 6
const nodePaddingPx = 11
const nodeBorderWidthPx = 2
const nodeFont = "Nunito Sans, Arial, Helvetica, sans-serif"
const subNameFont = `${nodeTextSizePx}px ${nodeFont}`
const moduleNameFont = `bold ${subNameFont}`

interface TaskState {
  indicator?: string
}

const taskStates: { [name: string]: TaskState } = {
  ready: {},
  pending: {},
  processing: { indicator: "--" },
  cancelled: {},
  error: {},
  disabled: {},
}

interface Props {
  graph: GraphOutputWithNodeStatus
  onGraphNodeSelected: SelectGraphNode
  selectedGraphNode: string | null
  isProcessing: boolean // set whenever wsMessages are received
  filters: Filters<StackGraphSupportedFilterKeys>
  onFilter: (filterKey: StackGraphSupportedFilterKeys) => void
}

export const StackGraph: React.FC<Props> = ({
  graph,
  onGraphNodeSelected,
  selectedGraphNode,
  isProcessing,
  filters,
  onFilter,
}) => {
  let spinner: React.ReactNode = null
  let graphStatus = ""
  if (isProcessing) {
    graphStatus = "Processing..."
    spinner = <ProcessSpinner background={colors.gardenWhite} size="2rem" />
  }

  const [selections, setSelections] = useState<string[]>(selectedGraphNode ? [selectedGraphNode] : [])

  const nodes = graph.nodes
    .filter((n) => filters[n.type].selected)
    .map((n) => {
      const { key, name, moduleName } = n

      let textWidth = getTextWidth(moduleName, moduleNameFont)
      let subName = moduleName !== name ? ` / ${name}` : ""

      if (subName) {
        textWidth += getTextWidth(subName, subNameFont)
      }

      const borderSize = nodeBorderWidthPx * 2
      const height = nodePaddingPx * 2 + nodeTextSizePx * 2 + nodeTextSpacingPx + borderSize * 2
      let width = Math.ceil(textWidth) + nodePaddingPx * 2 + borderSize * 2

      if (width < nodeMinWidth) {
        width = nodeMinWidth
      }

      return {
        id: key,
        height,
        width,
        data: n,
      }
    })

  const edges = graph.relationships
    .filter((n) => filters[n.dependant.type].selected && filters[n.dependency.type].selected)
    .map((r) => {
      const source = r.dependency
      const target = r.dependant
      return {
        id: `${source.key}-${target.key}`,
        from: source.key,
        to: target.key,
        type: source.type,
      }
    })

  function renderNode(event: NodeChildProps) {
    const { key, name, type, status, disabled, moduleName } = event.node.data

    const classes = ["node-container", `node-container--${type}`]

    if (status) {
      classes.push(status)
    }
    if (selections.includes(key)) {
      classes.push(selectedClassName)
    }
    if (disabled) {
      classes.push("disabled")
    }

    const subName = moduleName !== name ? ` / ${name}` : ""

    const onClick = () => {
      setSelections([key])
      onGraphNodeSelected(key)
    }

    return (
      <foreignObject x={0} y={0} height={event.height} width={event.width}>
        <div
          className={classes.join(" ")}
          // tslint:disable-next-line: jsx-no-lambda
          onClick={onClick}
        >
          <div className="type">
            {capitalize(type)}
            {disabled ? <i className="fas fa-ban" /> : ""}
          </div>
          <span className="module-name">{moduleName}</span>
          {subName}
        </div>
      </foreignObject>
    )
  }

  return (
    <Card>
      <div
        className={cls(
          css`
            position: relative;
          `
        )}
      >
        <div
          className={cls(
            css`
              position: absolute;
              top: 1rem;
              display: flex;
            `
          )}
        >
          <div className="ml-1">
            <FiltersButton filters={filters} onFilter={onFilter} />
            <div
              className={css`
                display: flex;
              `}
            >
              <Status>{graphStatus}</Status>
              {spinner}
            </div>
          </div>
        </div>

        <div id="chart">
          <Canvas
            readonly
            fit
            direction="RIGHT"
            maxHeight={5000}
            maxWidth={5000}
            layoutOptions={{ "algorithm": "layered", "org.eclipse.elk.partitioning.activate": true }}
            nodes={nodes}
            edges={edges}
            selections={selections}
            node={<Node style={{ fill: "white", strokeWidth: 0 }}>{renderNode}</Node>}
            edge={<Edge disabled style={{ stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: "1.5px" }} />}
            arrow={<MarkerArrow style={{ fill: "rgba(140, 140, 140)", strokeWidth: "5px" }} />}
          />
        </div>

        <div
          className={cls(
            css`
              position: absolute;
              right: 1rem;
              bottom: 1rem;
              display: flex;
              justify-content: flex-end;
              font-size: 0.8em;
            `,
            "mr-1"
          )}
        >
          {Object.entries(taskStates).map(([state, props]) => {
            return (
              <Span key={state}>
                <span
                  className={css`
                    color: ${colors.taskState[state]};
                    font-weight: bold;
                  `}
                >
                  {props.indicator || defaultTaskIndicator}{" "}
                </span>
                {capitalize(state)}
              </Span>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
