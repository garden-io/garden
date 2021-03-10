/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import { padEnd } from "lodash"
import React from "react"
import { default as AnsiUp } from "ansi_up"

import { colors } from "../styles/variables"
import { ServiceLogEntry } from "@garden-io/core/build/src/types/plugin/service/getServiceLogs"

interface Props {
  entries: ServiceLogEntry[]
  sectionPad: number
  showServiceName: boolean
}

const Term = styled.div`
  background-color: ${colors.gardenBlack};
  border-radius: 2px;
  max-height: calc(100vh - 12rem);
  overflow-y: auto;
  width: 100%;
`

const P = styled.p`
  color: ${colors.gardenWhite};
  font-size: 0.65rem;
  line-height: 0.7rem;
  margin: 0.15rem;
`

const Service = styled.span`
  color: ${colors.gardenGreen};
  display: inline-block;
`

const Timestamp = styled.span`
  color: ${colors.gardenGrayLight};
`

const ansiUp = new AnsiUp()

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
              <span dangerouslySetInnerHTML={{ __html: ansiUp.ansi_to_html(e.msg) }} />
            </P>
          )
        })}
      </code>
    </Term>
  )
}

export default Terminal
