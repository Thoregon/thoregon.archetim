/**
 * decorate any object used in universe
 *
 * tasks of the decorator
 * - instantiate and hold the entities object
 * - memorize where the entity is peristent
 * - keep metafdata of the entity
 * - emit entity events on behalf
 *
 * permissions:
 * -
 * - permit (handle)
 *
 * schema:
 * - immediate update
 * - deferred update within a transaction
 * - new instances initialized with property defaults
 * - non persistent properties
 *   - transient: can have a value but is not stored
 *   - computed: has a computed value and should not be stored
 *
 * @author: Martin Neitz, Bernhard Lukassen
 */


import AccessObserver from "/evolux.universe/lib/accessobserver.mjs";

export default class ThoregonDecorator extends AccessObserver {

    constructor(target, parent, schema) {
        super(target, parent);
        this.meta = { schema };
    }

    static observe(target, schema, parent) {
        return super.observe(target, parent, schema);
    }

    hasSchema() {
        return !!this.schema$;
    }

    get schema$() {
        return this.meta?.schema;
    }

    /*
     * thoregon
     */

    // lazy init
    // provide defaults at 'get' when they are requested
    // don't fill objects, they may change

/*
    initDefaults$$(properties) {
        Object.entries(this.schema$.attributes).forEach(([attribute, def]) =>{
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
*/

    get __id__() {

    }

    __schema__() {
        return this.schema;
    }

    async __store__() {

    }

    async __read__() {

    }

}
