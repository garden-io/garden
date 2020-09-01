/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { toLong, fromLong } from "ip"
import { Entity, Column, Index } from "typeorm"
import { GardenEntity } from "../base-entity"

const ipRangeStart = "127.10.0.1"
const ipRangeStartLong = toLong(ipRangeStart)

/**
 * Each LocalAddress entry maps a service+hostname to a local IP address. Used to make port forward addresses
 * consistent across Garden invocations.
 */
@Entity()
@Index(["projectName", "moduleName", "serviceName", "hostname"], { unique: true })
export class LocalAddress extends GardenEntity {
  @Column()
  projectName: string

  @Column()
  moduleName: string

  @Column()
  serviceName: string

  @Column()
  hostname: string

  // The entity ID maps to an IP in the 127.x.x.x range
  getIp() {
    return fromLong(ipRangeStartLong + this._id)
  }

  static async resolve(values: { projectName: string; moduleName: string; serviceName: string; hostname: string }) {
    try {
      await this.createQueryBuilder()
        .insert()
        .values({ ...values })
        .execute()
    } catch {}

    return this.findOneOrFail({ where: values })
  }
}
