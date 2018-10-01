"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
/*
  A simple set data structure that uses a custom key function for equality comparisons.

  Useful for sets of non-scalar entries, where the built-in Set data structure's === comparison is not suitable.
*/
class KeyedSet {
    constructor(keyFn) {
        this.keyFn = keyFn;
        this.map = new Map();
    }
    add(entry) {
        this.map.set(this.keyFn(entry), entry);
        return this;
    }
    delete(entry) {
        return this.map.delete(this.keyFn(entry));
    }
    has(entry) {
        return this.map.has(this.keyFn(entry));
    }
    hasKey(key) {
        return this.map.has(key);
    }
    // Returns set members in insertion order.
    entries() {
        return Array.from(this.map.values());
    }
    size() {
        return this.map.size;
    }
    clear() {
        this.map = new Map();
    }
}
exports.KeyedSet = KeyedSet;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInV0aWwva2V5ZWQtc2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7O0FBRUg7Ozs7RUFJRTtBQUNGLE1BQWEsUUFBUTtJQUduQixZQUFvQixLQUFvQjtRQUFwQixVQUFLLEdBQUwsS0FBSyxDQUFlO1FBQ3RDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtJQUN0QixDQUFDO0lBRUQsR0FBRyxDQUFDLEtBQVE7UUFDVixJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBQ3RDLE9BQU8sSUFBSSxDQUFBO0lBQ2IsQ0FBQztJQUVELE1BQU0sQ0FBQyxLQUFRO1FBQ2IsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7SUFDM0MsQ0FBQztJQUVELEdBQUcsQ0FBQyxLQUFRO1FBQ1YsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7SUFDeEMsQ0FBQztJQUVELE1BQU0sQ0FBQyxHQUFXO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDMUIsQ0FBQztJQUVELDBDQUEwQztJQUMxQyxPQUFPO1FBQ0wsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQTtJQUN0QyxDQUFDO0lBRUQsSUFBSTtRQUNGLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUE7SUFDdEIsQ0FBQztJQUVELEtBQUs7UUFDSCxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7SUFDdEIsQ0FBQztDQUVGO0FBckNELDRCQXFDQyIsImZpbGUiOiJ1dGlsL2tleWVkLXNldC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG4vKlxuICBBIHNpbXBsZSBzZXQgZGF0YSBzdHJ1Y3R1cmUgdGhhdCB1c2VzIGEgY3VzdG9tIGtleSBmdW5jdGlvbiBmb3IgZXF1YWxpdHkgY29tcGFyaXNvbnMuXG5cbiAgVXNlZnVsIGZvciBzZXRzIG9mIG5vbi1zY2FsYXIgZW50cmllcywgd2hlcmUgdGhlIGJ1aWx0LWluIFNldCBkYXRhIHN0cnVjdHVyZSdzID09PSBjb21wYXJpc29uIGlzIG5vdCBzdWl0YWJsZS5cbiovXG5leHBvcnQgY2xhc3MgS2V5ZWRTZXQ8Vj4ge1xuICBwcml2YXRlIG1hcDogTWFwPHN0cmluZywgVj5cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGtleUZuOiAoVikgPT4gc3RyaW5nKSB7XG4gICAgdGhpcy5tYXAgPSBuZXcgTWFwKClcbiAgfVxuXG4gIGFkZChlbnRyeTogVik6IEtleWVkU2V0PFY+IHtcbiAgICB0aGlzLm1hcC5zZXQodGhpcy5rZXlGbihlbnRyeSksIGVudHJ5KVxuICAgIHJldHVybiB0aGlzXG4gIH1cblxuICBkZWxldGUoZW50cnk6IFYpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5tYXAuZGVsZXRlKHRoaXMua2V5Rm4oZW50cnkpKVxuICB9XG5cbiAgaGFzKGVudHJ5OiBWKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMubWFwLmhhcyh0aGlzLmtleUZuKGVudHJ5KSlcbiAgfVxuXG4gIGhhc0tleShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLm1hcC5oYXMoa2V5KVxuICB9XG5cbiAgLy8gUmV0dXJucyBzZXQgbWVtYmVycyBpbiBpbnNlcnRpb24gb3JkZXIuXG4gIGVudHJpZXMoKTogVltdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLm1hcC52YWx1ZXMoKSlcbiAgfVxuXG4gIHNpemUoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5tYXAuc2l6ZVxuICB9XG5cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgdGhpcy5tYXAgPSBuZXcgTWFwKClcbiAgfVxuXG59XG4iXX0=
