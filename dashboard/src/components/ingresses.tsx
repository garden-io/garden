/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext } from "react"
import styled from "@emotion/styled"
import { ExternalLink } from "./links"
import { ServiceIngress } from "garden-cli/src/types/service"
import { truncateMiddle } from "../util/helpers"
import normalizeUrl from "normalize-url"
import { format } from "url"
import { UiStateContext } from "../context/ui"

const Ingresses = styled.div`
  font-size: 1rem;
  line-height: 1.4rem;
  color: #4f4f4f;
  max-height: 5rem;
  overflow: hidden;
  overflow-y: auto;

  ::-webkit-scrollbar {
    -webkit-appearance: none;
    width: 7px;
  }
  ::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.5);
    box-shadow: 0 0 1px rgba(255, 255, 255, 0.5);
  }
`
const LinkContainer = styled.div`
  padding-bottom: 1rem;
  font-size: .75rem;

  &:last-of-type {
    padding-bottom: 0;
  }
`

const getIngressUrl = (ingress: ServiceIngress) => {
  return normalizeUrl(format({
    protocol: ingress.protocol,
    hostname: ingress.hostname,
    port: ingress.port,
    pathname: ingress.path,
  }))
}

interface IngressesProp {
  ingresses: ServiceIngress[] | undefined
}

export default ({ ingresses }: IngressesProp) => {
  const { actions: { selectIngress } } = useContext(UiStateContext)

  const handleSelectIngress = (event) => {
    if (ingresses && ingresses.length) {
      const ingress = ingresses.find(i => i.path === event.target.id)
      if (ingress) {
        selectIngress(ingress)
      }
    }
  }

  return (
    <Ingresses>
      {(ingresses || []).map((ingress, index) => {
        const url = getIngressUrl(ingress)
        return (
          <LinkContainer key={ingress.path}>
            <div className="visible-lg-block">
              <ExternalLink id={ingress.path} onClick={handleSelectIngress} >
                {truncateMiddle(url)}
              </ExternalLink>
            </div>
            <div className="hidden-lg">
              <ExternalLink href={url} target="_blank">
                {truncateMiddle(url)}
              </ExternalLink>
            </div>
            {ingresses && (index < ingresses.length - 1) &&
              <br />
            }
          </LinkContainer>
        )
      })}
    </Ingresses>
  )
}
