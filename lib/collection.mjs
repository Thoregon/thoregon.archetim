/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import ThoregonEntity from "./thoregonentity.mjs";

export default class Collection extends ThoregonEntity() {

    static from(iterable) {
        const collection = new this();
        // iterate over
    }

    [Symbol.asyncIterator]() {

    }
}
