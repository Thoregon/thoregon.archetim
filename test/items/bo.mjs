/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ThoregonEntity from "/thoregon.archetim/lib/thoregonentity.mjs";

const metaclass = {};

export default class BO extends ThoregonEntity() {

    constructor(props) {
        super();
        Object.assign(this, props);
    }


}

BO.checkIn(import.meta, metaclass);
