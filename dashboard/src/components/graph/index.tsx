/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion"
import React, { Component } from "react"
import styled from "@emotion/styled"
import { capitalize } from "lodash"
import { event, select, selectAll } from "d3-selection"
import { zoom, zoomIdentity } from "d3-zoom"
import dagreD3 from "dagre-d3"
import { PickFromUnion } from "garden-service/build/src/util/util"
import Card from "../card"
import "./graph.scss"
import { colors, fontMedium } from "../../styles/variables"
import Spinner, { SpinnerProps } from "../spinner"
import { SelectGraphNode, StackGraphSupportedFilterKeys } from "../../contexts/ui"
import { SupportedEventName } from "../../contexts/api"
import { FiltersButton, Filters } from "../group-filter"
import { GraphOutputWithNodeStatus } from "../../containers/graph"

interface Node {
  name: string
  label: string
  id: string
  status?: string
  disabled: boolean
}

interface Edge {
  source: string
  target: string
  type: string
  since?: number
}

export interface Graph {
  nodes: Node[]
  edges: Edge[]
}

// FIXME: We shouldn't repeat the keys for both the type and the set below
type TaskNodeEventName = PickFromUnion<
  SupportedEventName,
  "taskPending" | "taskProcessing" | "taskComplete" | "taskError"
>

const taskNodeEventNames: Set<TaskNodeEventName> = new Set([
  "taskPending",
  "taskProcessing",
  "taskComplete",
  "taskError",
])

const selectedClassName = "selected"
let selectedNodeId: string | null = null
function clearGraphNodeSelection() {
  const selectedNode = selectedNodeId && document.getElementById(selectedNodeId)
  selectedNode && selectedNode.classList.remove(selectedClassName)
}

const MIN_CHART_WIDTH = 200
const MIN_CHART_HEIGHT = 200

function getNodeClass(node: Node) {
  let className = ""
  if (selectedNodeId === node.id) {
    className += selectedClassName
  }
  if (node.disabled) {
    className += " disabled"
  }

  className += (node.status && ` ${node.status}`) || ""
  return className
}

function drawChart(graph: Graph, width: number, height: number, onGraphNodeSelected: (string) => void) {
  // Create the input graph
  const g = new dagreD3.graphlib.Graph().setGraph({}).setDefaultEdgeLabel(function() {
    return {}
  })

  for (const node of graph.nodes) {
    g.setNode(node.id, {
      label: node.label,
      class: getNodeClass(node),
      id: node.id,
      labelType: "html",
    })
  }

  g.nodes().forEach(function(v) {
    const node = g.node(v)
    // Round the corners of the nodes
    node.rx = node.ry = 4
    // Remove node padding
    node.paddingBottom = 0
    node.paddingTop = 0
    node.paddingLeft = 0
    node.paddingRight = 0
  })

  // Set up edges, no special attributes.
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target)
  }

  // Create the renderer
  const render = new dagreD3.render()

  // Clear previous content if any (for updating)
  selectAll("#chart svg").remove()

  // Set width and height. Height gets updated once graph is rendered
  width = Math.max(width, MIN_CHART_WIDTH)
  height = Math.max(height, MIN_CHART_HEIGHT)

  const svg = select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height)

  // Set up an SVG group so that we can translate the final graph.
  const svgGroup = svg.append("g")

  // Set up zoom support
  const zoomHandler = zoom<SVGSVGElement, any>().on("zoom", () => {
    svgGroup.attr("transform", event.transform)
  })
  svg.call(zoomHandler)

  // Run the renderer. This is what draws the final graph.
  // FIXME: ts-ignore
  // @ts-ignore
  render(svgGroup, g)

  const initialScale = 0.75

  // Re-set svg frame height after graph has been been drawn
  // const graphHeight = g.graph().height * initialScale + 40
  // svg.attr("height", Math.max(graphHeight, MIN_CHART_HEIGHT))

  // Center the graph
  const xCenterOffset = (parseInt(svg.attr("width"), 10) - g.graph().width * initialScale) / 2
  const yCenterOffset = (parseInt(svg.attr("height"), 10) - g.graph().height * initialScale) / 2
  const zoomTranslate = zoomIdentity.translate(xCenterOffset, yCenterOffset).scale(initialScale)
  svg.call(zoomHandler.transform, zoomTranslate)

  const selections = svg.select("g").selectAll("g.node")
  selections.on("click", function(nodeName) {
    // tslint:disable-next-line: no-invalid-this
    const element = this as HTMLElement
    if (element.classList.contains("disabled")) {
      return
    }
    if (element) {
      clearGraphNodeSelection()

      // remove selected class from old node and set in new
      element.classList.add(selectedClassName)
      selectedNodeId = element.id
    }
    onGraphNodeSelected(nodeName)
  })
}

// Renders as HTML
const makeLabel = (name: string, type: string, moduleName: string, disabled: boolean) => {
  let typeEl: string
  if (disabled) {
    typeEl = `<div class="type">${capitalize(type)} <i class="fas fa-ban"></i></div>`
  } else {
    typeEl = `<div class='type'>${capitalize(type)}</div>`
  }
  let nameEl: string = ""
  if (moduleName !== name) {
    nameEl = `<span> / ${name}</span>`
  }
  return `
    <div class='node-container node-container--${type}'>
      ${typeEl}
      <span class='module-name'>${moduleName}</span>
      ${nameEl}
    </div>
  `
}

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

type ChartState = {
  nodes: Node[]
  edges: Edge[]
}

interface Props {
  graph: GraphOutputWithNodeStatus
  onGraphNodeSelected: SelectGraphNode
  selectedGraphNode: string | null
  layoutChanged: boolean // set whenever user toggles sidebar
  isProcessing: boolean // set whenever wsMessages are received
  filters: Filters<StackGraphSupportedFilterKeys>
  onFilter: (filterKey: StackGraphSupportedFilterKeys) => void
}

class Chart extends Component<Props, ChartState> {
  _nodes: Node[]
  _edges: Edge[]
  _chartRef: React.RefObject<any>

  state: ChartState = {
    nodes: [],
    edges: [],
  }

  constructor(props) {
    super(props)

    this._chartRef = React.createRef()
    this._nodes = []
    this._edges = []
  }

  componentDidMount() {
    this.drawChart()

    // Re-draw graph on **end** of window resize event (hence the timer)
    let resizeTimer: NodeJS.Timeout
    window.onresize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        this.drawChart()
      }, 250)
    }
  }

  componentWillUnmount() {
    window.onresize = () => {}
  }

  drawChart() {
    const graph = this.makeGraph()
    this._nodes = graph.nodes
    this._edges = graph.edges
    const width = this._chartRef.current.offsetWidth
    const height = this._chartRef.current.offsetHeight
    drawChart(graph, width, height, this.props.onGraphNodeSelected)
  }

  makeGraph() {
    const nodes: Node[] = this.props.graph.nodes
      .filter((n) => this.props.filters[n.type].selected)
      .map((n) => {
        return {
          id: n.key,
          name: n.name,
          label: makeLabel(n.name, n.type, n.moduleName, n.disabled),
          status: n.status,
          disabled: n.disabled,
        }
      })
    const edges: Edge[] = this.props.graph.relationships
      .filter((n) => this.props.filters[n.dependant.type].selected && this.props.filters[n.dependency.type].selected)
      .map((r) => {
        const source = r.dependency
        const target = r.dependant
        return {
          source: source.key,
          target: target.key,
          type: source.type,
        }
      })

    return { edges, nodes }
  }

  // FIXME: Refactor!
  componentDidUpdate(prevProps: Props, prevState: ChartState) {
    if (
      prevState !== this.state ||
      prevProps.graph !== this.props.graph ||
      (!prevProps.selectedGraphNode && this.props.selectedGraphNode) ||
      (prevProps.selectedGraphNode && !this.props.selectedGraphNode) ||
      prevProps.filters !== this.props.filters ||
      prevProps.layoutChanged !== this.props.layoutChanged
    ) {
      this.drawChart()
    }

    if (!this.props.selectedGraphNode) {
      clearGraphNodeSelection()
    }
  }

  clearClasses(el: HTMLElement) {
    // we use the event name as the class name
    for (const name of taskNodeEventNames) {
      el.classList.remove(name)
    }
  }

  render() {
    const chartHeightEstimate = `100vh - 2rem`

    let spinner: React.ReactNode = null
    let status = ""
    if (this.props.isProcessing) {
      status = "Processing..."
      spinner = <ProcessSpinner background={colors.gardenWhite} size="2rem" />
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
              <FiltersButton filters={this.props.filters} onFilter={this.props.onFilter} />
              <div
                className={css`
                  display: flex;
                `}
              >
                <Status>{status}</Status>
                {spinner}
              </div>
            </div>
          </div>
          <div
            className={css`
              height: calc(${chartHeightEstimate});
            `}
            ref={this._chartRef}
            id="chart"
          />
          <div
            className={cls(
              css`
                position: absolute;
                right: 1rem;
                bottom: 1rem;
                display: flex;
                justify-content: flex-end;
              `,
              "mr-1"
            )}
          >
            <Span>
              <span
                className={css`
                  color: ${colors.taskState.ready};
                `}
              >
                —{" "}
              </span>
              Ready
            </Span>
            <Span>
              <span
                className={css`
                  color: ${colors.taskState.pending};
                `}
              >
                —{" "}
              </span>
              Pending
            </Span>
            <Span>
              <span
                className={css`
                  color: ${colors.taskState.processing};
                `}
              >
                --{" "}
              </span>
              Processing
            </Span>
            <Span>
              <span
                className={css`
                  color: ${colors.taskState.cancelled};
                `}
              >
                —{" "}
              </span>
              Canceled
            </Span>
            <Span>
              <span
                className={css`
                  color: ${colors.taskState.error};
                `}
              >
                —{" "}
              </span>
              Error
            </Span>
            <Span>
              <span
                className={css`
                  color: ${colors.taskState.disabled};
                `}
              >
                —{" "}
              </span>
              Disabled
            </Span>
          </div>
        </div>
      </Card>
    )
  }
}

export default Chart
