/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { format } from "url"
import normalizeUrl from "normalize-url"

import Table from "./table"
import { ExternalLink } from "./links"

import { ModuleConfig } from "garden-cli/src/config/module"
import { ServiceStatus, ServiceIngress } from "garden-cli/src/types/service"

export function getIngressUrl(ingress: ServiceIngress) {
  return normalizeUrl(format({
    protocol: ingress.protocol,
    hostname: ingress.hostname,
    port: ingress.port,
    pathname: ingress.path,
  }))
}

interface ServicesProps {
  moduleConfigs: ModuleConfig[]
  services: { [name: string]: ServiceStatus }
}

interface ModulesProps {
  moduleConfigs: ModuleConfig[]
}

export const Modules: React.SFC<ModulesProps> = ({ moduleConfigs }) => {
  const rowHeaders = ["Name", "Type", "Services"]
  const rows = moduleConfigs.map(moduleConfig => [
    moduleConfig.name,
    moduleConfig.type,
    moduleConfig.serviceConfigs.map(s => s.name).join("\n"),
  ])
  return (
    <Table
      title="Modules"
      rowHeaders={rowHeaders}
      rows={rows}
    />
  )
}

export const Services: React.SFC<ServicesProps> = ({ moduleConfigs, services }) => {
  const rowHeaders = ["Name", "Status", "Module", "Ingresses"]
  const rows = Object.keys(services).map(serviceName => {
    const service = services[serviceName]
    const moduleConfig = moduleConfigs.find(m => m.serviceConfigs.map(s => s.name).includes(serviceName))
    const moduleName = moduleConfig ? moduleConfig.name : ""
    return [
      serviceName,
      service.state || "",
      moduleName,
      service.ingresses ? <Ingresses ingresses={service.ingresses} /> : null,
    ]
  })
  return (
    <Table
      title="Services"
      rowHeaders={rowHeaders}
      rows={rows}
    />
  )
}

interface IngressesProp {
  ingresses: ServiceIngress[]
}

const truncateMiddle = (str) => {
  if (str.length > 35) {
    return str.substr(0, 16) + "..." + str.substr(str.length - 16, str.length)
  }
  return str
}

const LinkContainer = styled.div`
  padding-bottom: 1rem;

  &:last-of-type{
    padding-bottom: 0;
  }
`
const Ingresses: React.SFC<IngressesProp> = ({ ingresses }) => {
  return (
    <div>
      {ingresses.map(i => {
        const url = getIngressUrl(i)
        return (
          <LinkContainer key={i.path}>
            <ExternalLink href={url} target="_blank">
              {truncateMiddle(url)}
            </ExternalLink>
            <br />
          </LinkContainer>
        )
      })}
    </div>
  )
}
