/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ContentHandler           from "../graph/contenthandler.mjs";
import { ErrNoArraysSupported } from "../errors.mjs";

export default class MatterContentHandler  extends ContentHandler {

    setValue(node, item) {
        // handle item type
        //  - simple
        //  - Object
        //  - Array
        if (item == undefined) {
            this.dropValue(node);
        } else if (isPrimitive(item)) {
            // treat as primitive, allow 'null' and 'undefined'
            // wrap the value with an object and
        } else {
            let keys = Object.keys(item);
            if (Array.isArray(item)) {
                throw ErrNoArraysSupported();
            } else if (keys.length > 0) {
                // resolve structure, separate value properties and object references
                let properties = {};
                let references =
                keys.forEach((subkey) => node.get(subkey).put(item[subkey]));
            } else {
                // remove node ?
                this.dropValue(node);
            }
        }

    }

    async getValue(node) {
        // get the
    }

    dropValue(node) {

    }
}
