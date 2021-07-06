/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  getCertificateFromTls,
  getClusterIssuerFromTls,
  getCertificateName,
} from "../../../../../../src/plugins/kubernetes/integrations/cert-manager"
import {
  CertManagerConfig,
  IngressTlsCertificate,
  LetsEncryptServerType,
} from "../../../../../../src/plugins/kubernetes/config"
import { expect } from "chai"
import { deline } from "../../../../../../src/util/string"
import { defaultIngressClass } from "../../../../../../src/plugins/kubernetes/constants"

describe("cert-manager setup", () => {
  const namespace = "testing-namespace"

  const tlsManager: CertManagerConfig = {
    install: true,
    email: "test@garden.io",
    acmeServer: "letsencrypt-staging",
  }
  const testTlsCertificate: IngressTlsCertificate = {
    name: "test-certificate",
    hostnames: ["test-hostname.garden"],
    secretRef: {
      name: "test-certificate-secret",
      namespace,
    },
  }

  const testCertificate = {
    apiVersion: "cert-manager.io/v1alpha2",
    kind: "Certificate",
    metadata: {
      name: "test-certificate-letsencrypt-staging",
    },
    spec: {
      commonName: "test-hostname.garden",
      dnsNames: ["test-hostname.garden"],
      issuerRef: {
        kind: "ClusterIssuer",
        name: "test-cluster-issuer",
      },
      secretName: "test-certificate-secret",
    },
  }

  const testClusterIssuer = {
    apiVersion: "cert-manager.io/v1alpha2",
    kind: "ClusterIssuer",
    metadata: {
      name: "test-cluster-issuer",
    },
    spec: {
      acme: {
        email: "test@garden.io",
        privateKeySecretRef: {
          name: "test-certificate-secret",
        },
        server: "https://acme-staging-v02.api.letsencrypt.org/directory",
        solvers: [
          {
            http01: {
              ingress: {
                class: "nginx",
              },
            },
          },
        ],
      },
    },
  }

  describe("getCertificateFromTls", () => {
    it("should return a valid cert-manager Certificate resource", () => {
      const issuerName = "test-cluster-issuer"
      const certificate = getCertificateFromTls({ tlsManager, tlsCertificate: testTlsCertificate, issuerName })
      expect(certificate).to.eql(testCertificate)
    })
  })

  describe("getClusterIssuerFromTls", () => {
    it("should return a valid cert-manager ClusterIssuer resource", () => {
      const issuerName = "test-cluster-issuer"
      const issuer = getClusterIssuerFromTls({
        name: issuerName,
        ingressClass: defaultIngressClass,
        tlsManager,
        tlsCertificate: testTlsCertificate,
      })
      expect(issuer).to.eql(testClusterIssuer)
    })
    it(
      deline`should return a valid cert-manager ClusterIssuer resource.
              Server url reflects the serverType parameter.`,
      () => {
        const issuerName = "test-cluster-issuer"
        const expectedServerUrl = "https://acme-v02.api.letsencrypt.org/directory"
        const prodServerType: LetsEncryptServerType = "letsencrypt-prod"
        const tlsManagerProd = {
          ...tlsManager,
          acmeServer: prodServerType,
        }
        const issuer = getClusterIssuerFromTls({
          name: issuerName,
          ingressClass: defaultIngressClass,
          tlsManager: tlsManagerProd,
          tlsCertificate: testTlsCertificate,
        })
        const { server } = issuer.spec.acme
        expect(server).to.eql(expectedServerUrl)
      }
    )
  })

  describe("getCertificateName", () => {
    it("should generate a certificate name", () => {
      const expectedName = "test-certificate-letsencrypt-staging"
      const defaultName = getCertificateName(tlsManager, testTlsCertificate)
      expect(defaultName).to.eq(expectedName)
    })
  })
})
