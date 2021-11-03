/**
 * The collection decorator does not mainain the propertymap in the object entry
 * instead it uses encrypted names
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { isIterable }    from "./serialize.mjs";
import ThoregonDecorator from "./thoregondecorator.mjs";

export default class ThoregonCollectionDecorator extends ThoregonDecorator {

    static from(obj) {
        if (isIterable(obj)) {
            // unnamed items, generate a 'name' (key) for each one
        } else {
            // object with names items
        }
    }

    get $collection() { return true }

    //
    // todo:
    //  - generate a key and salt for property name encryption
    //  - store it in the object entry
    //

    add(item) {
        const key = universe.random(9);
        return this.put(key, item);
    }

    put(key, item) {
        Object.defineProperty(item, '__id__', { value: key, enumerable: true, writable: false, configurable: false });

    }

    propertyKey(prop) {
        // encrypt name
    }

    [Symbol.asyncIterator]() {

    }
}
