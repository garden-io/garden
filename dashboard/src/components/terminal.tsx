/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled/macro"
import { padEnd } from "lodash"
import React from "react"

import { colors } from "../styles/variables"
import { ServiceLogEntry } from "../api/types"

interface Props {
  entries: ServiceLogEntry[]
  sectionPad: number
  title: string
  showServiceName: boolean
}

const Term = styled.div`
  background-color: ${colors.lightBlack};
  border-radius: 2px;
  max-height: 45rem;
  overflow-y: auto;
`

const P = styled.p`
  color: ${colors.white};
  font-size: 0.8rem;
`

const Service = styled.span`
  color: ${colors.brightTealAccent};
  display: inline-block;
`

const Timestamp = styled.span`
  color: ${colors.lightGray};
`

// FIXME Use whitespace instead of dots for the sectinon padding.
// For some reason whitespace is not rendered inside spans.
const Terminal: React.SFC<Props> = ({ entries, sectionPad, showServiceName }) => {
  return (
    <Term className="p-1">
      <code>
        {entries.map((e, idx) => {
          const service = showServiceName
            ? <Service>{padEnd(e.serviceName, sectionPad + 3, ".")}</Service>
            : ""
          return (
            <P key={idx}>
              {service}
              <Timestamp>[{e.timestamp}] </Timestamp>
              {e.msg}
            </P>
          )
        })}
      </code>
    </Term>
  )
}

export default Terminal
