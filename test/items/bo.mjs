/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ThoregonEntity from "/thoregon.archetim/lib/thoregonentity.mjs";
import MetaClass      from "../../lib/metaclass/metaclass.mjs";

export class BOMeta extends MetaClass {

    initiateInstance() {
        this.name = "BO";

        this.text       ( "a" );
        this.text       ( "x" );
        this.object     ( "b", BO);
        this.object     ( "c", BO);
        this.object     ( "y", BO);
        this.collection ( "i", BO);
        this.collection ( "j", Object, { embedded: true });
    }

};

export default class BO extends ThoregonEntity() {

    constructor(props) {
        super();
        Object.assign(this, props);
    }

    test() {
        console.log(("BO test"));
    }

}

BO.checkIn(import.meta, BOMeta);
