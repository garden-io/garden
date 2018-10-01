"use strict";
// NOTE: copied this from the is-subset package to avoid issues with their package manifest
// (https://github.com/studio-b12/is-subset/pull/9)
Object.defineProperty(exports, "__esModule", { value: true });
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
exports.isSubset = (superset, subset) => {
    if ((typeof superset !== "object" || superset === null) ||
        (typeof subset !== "object" || subset === null)) {
        return false;
    }
    if ((superset instanceof Date || subset instanceof Date)) {
        return superset.valueOf() === subset.valueOf();
    }
    return Object.keys(subset).every((key) => {
        if (!superset.propertyIsEnumerable(key)) {
            return false;
        }
        const subsetItem = subset[key];
        const supersetItem = superset[key];
        if ((typeof subsetItem === "object" && subsetItem !== null) ?
            !exports.isSubset(supersetItem, subsetItem) :
            supersetItem !== subsetItem) {
            return false;
        }
        return true;
    });
};

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInV0aWwvaXMtc3Vic2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwyRkFBMkY7QUFDM0YsbURBQW1EOztBQUVuRDs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUVVLFFBQUEsUUFBUSxHQUFHLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxFQUFFO0lBQzNDLElBQ0UsQ0FBQyxPQUFPLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLElBQUksQ0FBQztRQUNuRCxDQUFDLE9BQU8sTUFBTSxLQUFLLFFBQVEsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDLEVBQy9DO1FBQUUsT0FBTyxLQUFLLENBQUE7S0FBRTtJQUVsQixJQUNFLENBQUMsUUFBUSxZQUFZLElBQUksSUFBSSxNQUFNLFlBQVksSUFBSSxDQUFDLEVBQ3BEO1FBQUUsT0FBTyxRQUFRLENBQUMsT0FBTyxFQUFFLEtBQUssTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFBO0tBQUU7SUFFcEQsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1FBQ3ZDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFBRSxPQUFPLEtBQUssQ0FBQTtTQUFFO1FBRXpELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUM5QixNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDbEMsSUFDRSxDQUFDLE9BQU8sVUFBVSxLQUFLLFFBQVEsSUFBSSxVQUFVLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN2RCxDQUFDLGdCQUFRLENBQUMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDckMsWUFBWSxLQUFLLFVBQVUsRUFDN0I7WUFBRSxPQUFPLEtBQUssQ0FBQTtTQUFFO1FBRWxCLE9BQU8sSUFBSSxDQUFBO0lBQ2IsQ0FBQyxDQUFDLENBQUE7QUFDSixDQUFDLENBQUEiLCJmaWxlIjoidXRpbC9pcy1zdWJzZXQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBOT1RFOiBjb3BpZWQgdGhpcyBmcm9tIHRoZSBpcy1zdWJzZXQgcGFja2FnZSB0byBhdm9pZCBpc3N1ZXMgd2l0aCB0aGVpciBwYWNrYWdlIG1hbmlmZXN0XG4vLyAoaHR0cHM6Ly9naXRodWIuY29tL3N0dWRpby1iMTIvaXMtc3Vic2V0L3B1bGwvOSlcblxuLyoqXG4gKiBDaGVjayBpZiBhbiBvYmplY3QgaXMgY29udGFpbmVkIHdpdGhpbiBhbm90aGVyIG9iamVjdC5cbiAqXG4gKiBSZXR1cm5zIGB0cnVlYCBpZjpcbiAqIC0gYWxsIGVudW1lcmFibGUga2V5cyBvZiAqc3Vic2V0KiBhcmUgYWxzbyBlbnVtZXJhYmxlIGluICpzdXBlcnNldCosIGFuZFxuICogLSBldmVyeSB2YWx1ZSBhc3NpZ25lZCB0byBhbiBlbnVtZXJhYmxlIGtleSBvZiAqc3Vic2V0KiBzdHJpY3RseSBlcXVhbHNcbiAqICAgdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBzYW1lIGtleSBvZiAqc3VwZXJzZXQqIOKAkyBvciBpcyBhIHN1YnNldCBvZiBpdC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9ICBzdXBlcnNldFxuICogQHBhcmFtICB7T2JqZWN0fSAgc3Vic2V0XG4gKlxuICogQHJldHVybnMgIHtCb29sZWFufVxuICpcbiAqIEBtb2R1bGUgICAgaXMtc3Vic2V0XG4gKiBAZnVuY3Rpb24gIGRlZmF1bHRcbiAqIEBhbGlhcyAgICAgaXNTdWJzZXRcbiAqL1xuXG5leHBvcnQgY29uc3QgaXNTdWJzZXQgPSAoc3VwZXJzZXQsIHN1YnNldCkgPT4ge1xuICBpZiAoXG4gICAgKHR5cGVvZiBzdXBlcnNldCAhPT0gXCJvYmplY3RcIiB8fCBzdXBlcnNldCA9PT0gbnVsbCkgfHxcbiAgICAodHlwZW9mIHN1YnNldCAhPT0gXCJvYmplY3RcIiB8fCBzdWJzZXQgPT09IG51bGwpXG4gICkgeyByZXR1cm4gZmFsc2UgfVxuXG4gIGlmIChcbiAgICAoc3VwZXJzZXQgaW5zdGFuY2VvZiBEYXRlIHx8IHN1YnNldCBpbnN0YW5jZW9mIERhdGUpXG4gICkgeyByZXR1cm4gc3VwZXJzZXQudmFsdWVPZigpID09PSBzdWJzZXQudmFsdWVPZigpIH1cblxuICByZXR1cm4gT2JqZWN0LmtleXMoc3Vic2V0KS5ldmVyeSgoa2V5KSA9PiB7XG4gICAgaWYgKCFzdXBlcnNldC5wcm9wZXJ0eUlzRW51bWVyYWJsZShrZXkpKSB7IHJldHVybiBmYWxzZSB9XG5cbiAgICBjb25zdCBzdWJzZXRJdGVtID0gc3Vic2V0W2tleV1cbiAgICBjb25zdCBzdXBlcnNldEl0ZW0gPSBzdXBlcnNldFtrZXldXG4gICAgaWYgKFxuICAgICAgKHR5cGVvZiBzdWJzZXRJdGVtID09PSBcIm9iamVjdFwiICYmIHN1YnNldEl0ZW0gIT09IG51bGwpID9cbiAgICAgICAgIWlzU3Vic2V0KHN1cGVyc2V0SXRlbSwgc3Vic2V0SXRlbSkgOlxuICAgICAgICBzdXBlcnNldEl0ZW0gIT09IHN1YnNldEl0ZW1cbiAgICApIHsgcmV0dXJuIGZhbHNlIH1cblxuICAgIHJldHVybiB0cnVlXG4gIH0pXG59XG4iXX0=
