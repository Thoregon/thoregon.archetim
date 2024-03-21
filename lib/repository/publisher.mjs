/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { source, insertBlanksAtBeginning } from "/evolux.util/lib/stringutil.mjs";

export default class Publisher {

    constructor(id, { name, alias, description, uri } = {}) {
        Object.assign(this, { id, name, alias, description, uri });
    }

    asSource(indent) {
        let str = source(this);
        return insertBlanksAtBeginning(str, 4, false);
    }


    static fromObj(struct) {
        const { id, name, alias, desciption, uri } = struct;
        const publisher = new Publisher(id, { name, alias, desciption, uri });
        return publisher;
    }

}
