/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Entity, Column, Index } from "typeorm"
import { GardenEntity } from "../base-entity"

@Entity()
@Index(["token"], { unique: true })
export class ClientAuthToken extends GardenEntity {
  @Column()
  token: string
}
