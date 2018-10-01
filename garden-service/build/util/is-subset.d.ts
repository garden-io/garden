/**
 * Check if an object is contained within another object.
 *
 * Returns `true` if:
 * - all enumerable keys of *subset* are also enumerable in *superset*, and
 * - every value assigned to an enumerable key of *subset* strictly equals
 *   the value assigned to the same key of *superset* – or is a subset of it.
 *
 * @param  {Object}  superset
 * @param  {Object}  subset
 *
 * @returns  {Boolean}
 *
 * @module    is-subset
 * @function  default
 * @alias     isSubset
 */
export declare const isSubset: (superset: any, subset: any) => boolean;
//# sourceMappingURL=is-subset.d.ts.map