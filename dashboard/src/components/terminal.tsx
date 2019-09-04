/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import { padEnd } from "lodash"
import React from "react"

import { colors } from "../styles/variables"
import { ServiceLogEntry } from "garden-service/build/src/types/plugin/service/getServiceLogs"

interface Props {
  entries: ServiceLogEntry[]
  sectionPad: number
  showServiceName: boolean
}

const Term = styled.div`
  background-color: ${colors.gardenBlack};
  border-radius: 2px;
  max-height: calc(100vh - 9rem);
  overflow-y: auto;
`

const P = styled.p`
  color: ${colors.gardenWhite};
  font-size: 0.8rem;
`

const Service = styled.span`
  color: ${colors.gardenGreen};
  display: inline-block;
`

const Timestamp = styled.span`
  color: ${colors.gardenGrayLight};
`

const Terminal: React.FC<Props> = ({ entries, sectionPad, showServiceName }) => {
  return (
    <Term className="p-1">
      <code>
        {entries.map((e, idx) => {
          const service = showServiceName ? <Service>{padEnd(e.serviceName, sectionPad + 3, "\u00A0")}</Service> : ""
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
