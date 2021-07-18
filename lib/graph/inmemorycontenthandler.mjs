/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ContentHandler           from "./contenthandler.mjs";
import { isPrimitive }          from "/evolux.util/lib/utilfns.mjs";
import { ErrNoArraysSupported } from "../errors.mjs";

// const isPrimitive = (test) => test !== Object(test);

export default class InMemoryContentHandler extends ContentHandler {

    setValue(node, item) {
        // handle item type
        //  - simple
        //  - Object
        //  - Array
        if (item == undefined) {
            this.dropValue(node);
        } else if (isPrimitive(item)) {
            // treat as primitive, allow 'null' and 'undefined'
            node._content = item;
        } else {
            let keys = Object.keys(item);
            if (Array.isArray(item)) {
                throw ErrNoArraysSupported();
            } else if (keys.length > 0) {
                // resolve structure and store elements
                keys.forEach((subkey) => node.get(subkey).put(item[subkey]));
            } else {
                // remove node ?
                this.dropValue(node);
            }
        }
    }

    async getValue(node) {
        return node._content;
    }

    dropValue(node) {
        delete node._content[key];
    }
}
