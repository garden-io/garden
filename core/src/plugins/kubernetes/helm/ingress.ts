/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceIngress, ServiceProtocol } from "../../../types/service"

export function getIngresses(resources): ServiceIngress[] {
  return resources.filter((obj) => obj.kind === "Ingress").flatMap(getServiceIngressesFromRules)
}

function getServiceIngressesFromRules(obj): ServiceIngress[] {
  const rules = obj.spec.rules || []
  const certificateHostnames = getCertificateHostnames(obj.spec.tls)

  return rules.flatMap((rule) => {
    const hostname = rule.host
    const useTLS = certificateHostnames.includes(hostname)

    return rule.http.paths.map((pathSpec) => ({
      hostname,
      path: pathSpec.path,
      protocol: <ServiceProtocol>(useTLS ? "https" : "http"),
      port: useTLS ? 443 : 80,
    }))
  })
}

function getCertificateHostnames(tlsSpec): string[] {
  if (!tlsSpec) {
    return []
  }

  return tlsSpec.flatMap((obj) => obj.hosts)
}
