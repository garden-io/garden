/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import forge from "node-forge"
import { X509Certificate } from "node:crypto"

// Reference: https://github.com/digitalbazaar/forge#x509
export function createSelfSignedTlsCert(hostName: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

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

  const certPem = forge.pki.certificateToPem(cert)

  return {
    cert,
    keys,
    certPem,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    publicKeyPem: forge.pki.publicKeyToPem(keys.publicKey),
  }
}

export function getHostnamesFromPem(crtData: string) {
  const cert = new X509Certificate(crtData)
  const legacyObject = cert.toLegacyObject()
  const hostnames: string[] = []

  const commonName = legacyObject.subject.CN

  if (commonName) {
    hostnames.push(commonName)
  }

  const altNames = cert.subjectAltName?.split(",").map((s) => s.trim()) ?? []

  for (const altName of altNames) {
    const [_type, name] = altName.split(":")
    hostnames.push(name)
  }

  return hostnames
}
