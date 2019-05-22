/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion"
import React, { Component } from "react"
import styled from "@emotion/styled"
import { capitalize, uniq } from "lodash"
import * as d3 from "d3"
import dagreD3 from "dagre-d3"

import Card from "../card"

import "./graph.scss"
import { colors, fontMedium } from "../../styles/variables"
import Spinner, { SpinnerProps } from "../spinner"
import { SelectGraphNode, StackGraphSupportedFilterKeys } from "../../context/ui"
import { WsEventMessage, SupportedEventName } from "../../context/events"
import { Extends } from "garden-cli/src/util/util"
import { ConfigDump } from "garden-cli/src/garden"
import { FiltersButton, Filters } from "../group-filter"
import { RenderedNodeType } from "garden-cli/src/config-graph"
import { GraphOutputWithNodeStatus } from "../../context/data"

interface Node {
  name: string
  label: string
  id: string
  status?: string
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
type TaskNodeEventName = Extends<
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
  const selectedNode =
    selectedNodeId && document.getElementById(selectedNodeId)
  selectedNode && selectedNode.classList.remove(selectedClassName)
}

const MIN_CHART_WIDTH = 200
const MIN_CHART_HEIGHT = 200

function getNodeClass(node) {
  let className = ""
  if (selectedNodeId === node.id) {
    className += selectedClassName
  }

  className += (node.status && ` ${node.status}` || "")
  return className
}

function drawChart(
  graph: Graph,
  width: number,
  height: number,
  onGraphNodeSelected: (string) => void,
) {
  // Create the input graph
  const g = new dagreD3.graphlib.Graph()
    .setGraph({})
    .setDefaultEdgeLabel(function() {
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
  d3.selectAll("#chart svg").remove()

  // Set width and height. Height gets updated once graph is rendered
  width = Math.max(width, MIN_CHART_WIDTH)
  height = Math.max(height, MIN_CHART_HEIGHT)

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height)

  // Set up an SVG group so that we can translate the final graph.
  const svgGroup = svg.append("g")

  // Set up zoom support
  const zoom = d3.zoom<SVGSVGElement, {}>().on("zoom", () => {
    svgGroup.attr("transform", d3.event.transform)
  })
  svg.call(zoom)

  // Run the renderer. This is what draws the final graph.
  // FIXME: ts-ignore
  // @ts-ignore
  render(svgGroup, g)

  const initialScale = 0.75

  // Re-set svg frame height after graph has been been drawn
  // const graphHeight = g.graph().height * initialScale + 40
  // svg.attr("height", Math.max(graphHeight, MIN_CHART_HEIGHT))

  // Center the graph
  const xCenterOffset =
    (parseInt(svg.attr("width"), 10) - g.graph().width * initialScale) / 2
  const yCenterOffset =
    (parseInt(svg.attr("height"), 10) - g.graph().height * initialScale) / 2
  const zoomTranslate = d3.zoomIdentity
    .translate(xCenterOffset, yCenterOffset)
    .scale(initialScale)
  svg.call(zoom.transform, zoomTranslate)

  const selections = svg.select("g").selectAll("g.node")
  selections.on("click", function(evt) {
    // tslint:disable-next-line: no-invalid-this
    const element = this as HTMLElement
    if (element) {
      clearGraphNodeSelection()

      // remove selected class from old node and set in new
      element.classList.add(selectedClassName)
      selectedNodeId = element.id
    }
    onGraphNodeSelected(evt)
  })
}

interface Props {
  config: ConfigDump
  graph: GraphOutputWithNodeStatus
  onGraphNodeSelected: SelectGraphNode
  selectedGraphNode: string | null
  layoutChanged: boolean
  message?: WsEventMessage
}

interface State {
  filters: Filters<StackGraphSupportedFilterKeys>
  nodes: Node[]
  edges: Edge[]
}

// Renders as HTML
const makeLabel = (name: string, type: string, moduleName: string) => {
  return `
    <div class='node-container node-container--${type}'>
        <div class='type'>${capitalize(type)}</div>
    <span>
      <span class='module-name'>${moduleName}</span>
        ${
    moduleName !== name
      ? `<span> / </span>
           <span>${name}</span>`
      : ``
    }
    </div>`
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
  nodes: Node[],
  edges: Edge[],
  filters: Filters<StackGraphSupportedFilterKeys>,
}

class Chart extends Component<Props, State> {
  _nodes: Node[]
  _edges: Edge[]
  _chartRef: React.RefObject<any>

  state: ChartState = {
    nodes: [],
    edges: [],
    filters: {
      run: { selected: true, label: "Run" },
      deploy: { selected: true, label: "Deploy" },
      test: { selected: true, label: "Test" },
      build: { selected: true, label: "Build" },
    },
  }

  constructor(props) {
    super(props)

    this._chartRef = React.createRef()
    this.handleFilter = this.handleFilter.bind(this)
    this._nodes = []
    this._edges = []

    const createFiltersState =
      (allGroupFilters, type): Filters<StackGraphSupportedFilterKeys> => {
        return ({
          ...allGroupFilters,
          [type]: {
            ...(allGroupFilters[type]),
            visible: true,
          },
        })
      }
    const taskTypes: RenderedNodeType[] = uniq(this.props.graph.nodes.map(n => n.type))
    const filters: Filters<StackGraphSupportedFilterKeys> = taskTypes.reduce(createFiltersState, this.state.filters)
    this.state = {
      ...this.state,
      filters,
    }
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
    window.onresize = () => { }
  }

  handleFilter(key: string) {
    const toggledFilters = this.state.filters
    toggledFilters[key].selected = !toggledFilters[key].selected
    this.setState({
      filters: toggledFilters,
    })
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
    const { filters } = this.state
    const nodes: Node[] = this.props.graph.nodes
      .filter(n => filters[n.type].selected)
      .map(n => {
        return {
          id: n.key,
          name: n.name,
          label: makeLabel(n.name, n.type, n.moduleName),
          status: n.status,
        }
      })
    const edges: Edge[] = this.props.graph.relationships
      .filter(n => filters[n.dependant.type].selected && filters[n.dependency.type].selected)
      .map(r => {
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

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (
      (prevState !== this.state) ||
      (prevProps.graph !== this.props.graph) ||
      (!prevProps.selectedGraphNode && this.props.selectedGraphNode) ||
      (prevProps.selectedGraphNode && !this.props.selectedGraphNode) ||
      (prevProps.layoutChanged !== this.props.layoutChanged)) {
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
    const { message } = this.props
    const chartHeightEstimate = `100vh - 2rem`

    let spinner: React.ReactNode = null
    let status = ""
    if (message && message.name !== "taskGraphComplete") {
      status = "Processing..."
      spinner = <ProcessSpinner background={colors.gardenWhite} size="2rem" />
    }

    return (
      <Card>
        <div
          className={cls(
            css`
              position: relative;
            `,
          )}
        >
          <div
            className={cls(
              css`
                position: absolute;
                top: 1rem;
                display: flex;
              `,
            )}
          >
            <div className="ml-1" >
              <FiltersButton
                filters={this.state.filters}
                onFilter={this.handleFilter}
              />
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
              "mr-1",
            )}
          >
            <Span>
              <span
                className={css`
                    color: ${colors.gardenGreen};
                  `}
              >
                —{" "}
              </span>
              Ready
              </Span>
            <Span>
              <span
                className={css`
                    color: ${colors.gardenPink};
                  `}
              >
                —{" "}
              </span>
              Pending
              </Span>
            <Span>
              <span
                className={css`
                    color: ${colors.gardenPink};
                  `}
              >
                --{" "}
              </span>
              Processing
              </Span>
            <Span>
              <span
                className={css`
                    color: red;
                  `}
              >
                —{" "}
              </span>
              Error
              </Span>
          </div>
        </div>
      </Card>
    )
  }
}

export default Chart
