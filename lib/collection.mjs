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

    chainAutoComplete(entity) {
        // collection does not chain autocompletion!
    }

}

export default class Collection extends Directory {

    static materialize({ soul, inmem = false } = {}) {
        return super.materialize(undefined, { soul, inmem })
    }

    static with(items, Itemclass) {
        const col = this.create();
        (items ?? []).forEach((item) => { if (item != undefined) col.add(col.__adjustItem__(item, Itemclass)) });
        return col;
    }

    // todo [OPEN]: allow a collection of entiries to be added
    add(entry) {
        //@$ATTR -> add the entry with a random key
        const key = entry.handle ?? universe.random(9);
        this[key] = entry;
        return this.get(key);   // get again, it may now be decorated (don't return entry)
        // return key;
    }

    get isKeyed() {
        return false;
    }

    drop(key) {
        delete this[key];
    }

    async reserveProperty(prop, Cls) {
        throw ErrCantReserveProperty(prop);
    }
}

MetaClass.useCollectionCls(Collection);
Collection.checkIn(import.meta, CollectionMeta);

if (globalThis.universe) universe.$Collection = Collection;
