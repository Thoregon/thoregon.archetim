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
        this.text       ( "b" );
        this.text       ( "x", { defaultValue: 'X' } );
        this.object     ( "b", BO);
        this.object     ( "c", BO);
        this.object     ( "y", BO);
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

    get b() {
        if (!this._b) this.b = 'B';
        return this._b;
    }

    set b(val) {
        this._b = val;
    }

}

BO.checkIn(import.meta, BOMeta);
