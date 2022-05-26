/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { EventEmitter2 } from "eventemitter2"

type StringOnly<T> = T extends string ? T : never

type StringKeys<T extends object> = keyof {
  [K in keyof T as StringOnly<K>]
}

export class TypedEventEmitter<T extends object> extends EventEmitter2 {
  emit<N extends StringKeys<T>>(name: N, payload: T[N]) {
    return super.emit(name, payload)
  }

  on<N extends StringKeys<T>>(name: N, listener: (payload: T[N]) => void) {
    return super.on(name, listener)
  }

  onAny(listener: <N extends StringKeys<T>>(name: N, payload: T[N]) => void) {
    return super.onAny(<any>listener)
  }

  once<N extends StringKeys<T>>(name: N, listener: (payload: T[N]) => void) {
    return super.once(name, listener)
  }
}
