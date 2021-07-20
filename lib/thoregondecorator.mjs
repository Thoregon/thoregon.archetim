/**
 * decorate any object used in universe
 *
 * - immediate update
 * - deferred update within a transaction
 *
 * Tasks of the decorator
 * - instantiate and hold the entities object
 * - memorize where the entity is peristent
 * - keep metafdata of the entity
 * - emit entity events on behalf
 *
 * @author: Martin Neitz, Bernhard Lukassen
 */


import AccessObserver from "/evolux.universe/lib/accessobserver.mjs";

const decorator = {
    objectSchema(obj, receiver, observer, prop) {

    }
}

export default class ThoregonDecorator extends AccessObserver {

    constructor(schema, target, parent) {
        super(target, parent);
        this.schema = schema;

    }

    static observe(target, schema, parent) {
        return super.observe(target, parent, schema);
    }

    initialDecorator() {
        return  Object.assign(super.initialDecorator(), decorator);
    }

    initDefaults(properties) {
        Object.entries(this.schema.attributes).forEach(([attribute, def]) =>{
                if ( properties[attribute] ) {
                    this[attribute] = properties[attribute];
                } else if ( def.hasOwnProperty("default") ) {
                    this[attribute] = def.default;
                } else {
                    this[attribute] = undefined;
                }
            }
        );
    }
}
