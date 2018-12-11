/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import { truncate } from "lodash"
import { format } from "url"
import normalizeUrl from "normalize-url"

import Table from "./table"
import { ExternalLink } from "./links"

import {
  FetchStatusResponse,
  ServiceStatus,
  FetchConfigResponse,
  Module,
  ServiceIngress,
} from "../api/types"

interface Props {
  status: FetchStatusResponse
  config: FetchConfigResponse
}

export function getIngressUrl(ingress: ServiceIngress) {
  return normalizeUrl(format({
    protocol: ingress.protocol,
    hostname: ingress.hostname,
    port: ingress.port,
    pathname: ingress.path,
  }))
}

const Overview: React.SFC<Props> = ({ config, status }) => {
  return (
    <div>
      <Modules modules={config.modules} />
      <Services modules={config.modules} services={status.services} />
    </div>
  )
}

interface ServicesProps {
  modules: Module[]
  services: { [name: string]: ServiceStatus }
}

interface ModulesProps {
  modules: Module[]
}

const Modules: React.SFC<ModulesProps> = ({ modules }) => {
  const rowHeaders = ["Name", "Type", "Services"]
  const rows = modules.map(module => [
    module.name,
    module.type,
    module.services.map(s => s.name).join("\n"),
  ])
  return (
    <Table
      title="Modules"
      rowHeaders={rowHeaders}
      rows={rows}>
    </Table>
  )
}

const Services: React.SFC<ServicesProps> = ({ modules, services }) => {
  const rowHeaders = ["Name", "Status", "Module", "Ingresses"]
  const rows = Object.keys(services).map(service => [
    service,
    services[service].state,
    modules.find(m => m.serviceNames.includes(service)).name,
    <Ingresses ingresses={services[service].ingresses} />,
  ])
  return (
    <Table
      title="Services"
      rowHeaders={rowHeaders}
      rows={rows}>
    </Table>
  )
}

interface IngressesProp {
  ingresses: ServiceIngress[]
}

const Ingresses: React.SFC<IngressesProp> = ({ ingresses }) => {
  return (
    <div>
      {ingresses.map(i => {
        const url = getIngressUrl(i)
        return (
          <p key={i.path}>
            <ExternalLink href={url} target="_blank">
              {truncate(url, { length: 30 })}
            </ExternalLink>
          </p>
        )
      })}
    </div>
  )
}

export default Overview
