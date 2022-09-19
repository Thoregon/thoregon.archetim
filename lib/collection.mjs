/**
 * use to store key/value maps
 *
 * todo [OPEN]
 *  - indexes based on directory/object to properties
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import { doAsync }                        from "/evolux.universe";
import MetaClass, { ATTRIBUTE_MODE }      from "./metaclass/metaclass.mjs";
import { ErrCantReserveProperty }         from "./errors.mjs";
import Directory                          from "./directory.mjs";

export class CollectionMeta extends MetaClass {

    initiateInstance() {
        this.name                     = "Collection";
        this.attributeMode            = ATTRIBUTE_MODE.VARIABLE;
        const attributePresets        = this.attributePresets;
        attributePresets.autocomplete = true;
        attributePresets.cls          = Collection;
    }

    async chainAutoComplete(entity) {
        // collection does not chain autocompletion!
    }

}

export default class Collection extends Directory {

    static async materialize({ store, inmem = false } = {}) {
        return await super.materialize(undefined, { store, inmem })
    }

    // todo [OPEN]: allow a collection of entiries to be added
    async add(entry) {
        //@$ATTR -> add the entry with a random key
        const key = universe.random(9);
        this[key] = entry;
        await doAsync();
        return key;
    }

    drop(key) {
        delete this[key];
    }

    async reserveProperty(prop, Cls) {
        throw ErrCantReserveProperty(prop);
    }
}

Collection.checkIn(import.meta, CollectionMeta);

if (globalThis.universe) universe.$Collection = Collection;
