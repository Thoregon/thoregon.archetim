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
import ThoregonEntity                         from "./thoregonentity.mjs";
import MetaClass, { VARIABLE_ATTRIBUTE_MODE } from "./metaclass/metaclass.mjs";

export class KeyedCollectionMeta extends MetaClass {

    initiateInstance() {
        this.name               = "KeyedCollection";
        this.variableAttributes = VARIABLE_ATTRIBUTE_MODE.ASIS;
    }

}

export default class KeyedCollection extends ThoregonEntity() {

    add(entry) {
        //@$ATTR -> add the entry with a random key
        const key = universe.random(9);
        this[key] = entry;
        return key;
    }

    get(key) {
        return this[key];
    }

    drop(key) {
        delete this[key];
    }

}

KeyedCollection.checkIn(import.meta, KeyedCollectionMeta);
