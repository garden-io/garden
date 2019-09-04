/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pki } from "node-forge"
import { certpem } from "certpem"
import { find } from "lodash"

// Reference: https://github.com/digitalbazaar/forge#x509
export function createSelfSignedTlsCert(hostName: string) {
  const keys = pki.rsa.generateKeyPair(2048)
  const cert = pki.createCertificate()

  cert.publicKey = keys.publicKey

  // NOTE: serialNumber is the hex encoded value of an ASN.1 INTEGER.
  // Conforming CAs should ensure serialNumber is:
  // - no more than 20 octets
  // - non-negative (prefix a "00" if your value starts with a "1" bit)
  cert.serialNumber = "01"

  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  const attrs = [
    {
      name: "commonName",
      value: hostName,
    },
    {
      name: "countryName",
      value: "US",
    },
    {
      shortName: "ST",
      value: "Virginia",
    },
    {
      name: "organizationName",
      value: "Test",
    },
    {
      shortName: "OU",
      value: "Test",
    },
  ]

  cert.setSubject(attrs)
  cert.setIssuer(attrs)

  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true,
    },
    {
      name: "nsCertType",
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true,
    },
    {
      name: "subjectAltName",
      altNames: [
        {
          type: 2, // DNS
          value: hostName,
        },
      ],
    },
    {
      name: "subjectKeyIdentifier",
    },
  ])

  // self-sign certificate
  cert.sign(keys.privateKey)

  const certPem = pki.certificateToPem(cert)

  return {
    cert,
    keys,
    certPem,
    privateKeyPem: pki.privateKeyToPem(keys.privateKey),
    publicKeyPem: pki.publicKeyToPem(keys.publicKey),
  }
}

export function getHostnamesFromPem(crtData: string) {
  // Note: Can't use the certpem.info() method here because of multiple bugs.
  // And yes, this API is insane. Crypto people are bonkers. Seriously. - JE
  const certInfo = certpem.debug(crtData)

  const hostnames: string[] = []

  const commonNameField = find(certInfo.subject.types_and_values, ["type", "2.5.4.3"])
  if (commonNameField) {
    hostnames.push(commonNameField.value.value_block.value)
  }

  for (const ext of certInfo.extensions || []) {
    if (ext.parsedValue && ext.parsedValue.altNames) {
      for (const alt of ext.parsedValue.altNames) {
        hostnames.push(alt.Name)
      }
    }
  }

  return hostnames
}
