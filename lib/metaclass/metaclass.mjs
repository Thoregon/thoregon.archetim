/*
 * representation and helper for ThoregonEntity reflection
 *
 * todo:
 *  - add default datetime attributes 'created', 'modified'
 *  - persistent=false -> will be treated as derived/computed attribute
 *      - scan class for attributes with 'get' only -> update 'persistent=false' in metaclass
 *      - change event for all derived attrs will be sent after any modification of the entity
 *      - for aggregations, e.g. length of list, the may be additional listeners necessary
 *          - the 'inner' change events of the collection must trigger the change of the aggregation
 *
 * @author: Martin Neitz, Bernhard Lukassen
 */

// import { ImageDescriptorMeta } from "../complexentities/Imagedescriptor.mjs";

import { isFunction, isObject } from "/evolux.util/index.mjs";
import { doAsync }              from "/evolux.universe/index.mjs";

const instances = new Map();

export const PERSISTENCE_MODE = {
    "NONE"       : "none",
    "IMMEDIATE"  : "immediate",
    "TRANSACTION": "transaction"
}

export const ATTRIBUTE_MODE = {
    "NAMED"     : 0,
    "VARIABLE"  : 1,
    "VARENCRYPT": 2,
}

const excludeAttribute = (name) => name.startsWith('$') || name.startsWith('_') || name.endsWith('$') || name.endsWith('_');

const ATTRIBUTE_PRESETS = {
    mandatory   : false,        // if true a value is required for the entity to be valid. Caution: also non valid entities will be stored, they can be revised later
    defaultValue: undefined,
    persistent  : true,         // defines if this property will be stored
    embedded    : true,         // be careful with objects and references and lists
    enumerable  : true,         // if false, this property will not show up in enumerations of the properties of the entity (iterators will skip it)
    autocomplete: false,        // defines if this property will be completed (initialized) automatically on access. takes either a default value or, if missing, creates a new instance from the specified class (object meta class)
    validations : [],
    i18n        : {},
    description : '',
    emergent    : false
};

export default class MetaClass {

    constructor() {
        this.classname        = undefined;
        this._name            = undefined;    // array with different information just as API - FormID etc
        this.description      = undefined;
        this.version          = 0;
        this._attributes      = {};           // object with styling information
        this.embedded         = false;
        this.attributeMode    = ATTRIBUTE_MODE.NAMED;
        this._persistencemode = PERSISTENCE_MODE.IMMEDIATE;     //  none | immediate | transaction
        this.actions          = {};
        this._eventListeners  = {};
        this.useTimestamps    = true;
        this.attributePresets = ATTRIBUTE_PRESETS;
        this._procesors = { events: [], modifiers: [], validators: [] };
        this.initiateInstance();
        this._buildTimestampAttributes();
    }

    // Singleton instance of MetaClass may be cached in case of performance
    static getInstance() {
        let  instance = instances.get( this );
        if ( ! instance  ) {
            instance = new this();
            instances.set(this, instance );
        }
        return instance;
    }

    /**
     * Build a metaclass with default property desciptions
     * based on a model object
     * @param obj
     */
    static any(obj) {
        // todo
        const metaclass = new this();
        metaclass.attributeMode = ATTRIBUTE_MODE.VARENCRYPT;
        return metaclass;
    }

    static get PERSISTENCE_MODE() {
        return PERSISTENCE_MODE;
    }

    static pseudoMeta(obj) {
        const meta = new this();
        // todo [OPEN]: loop over properties and best guess meta info
        return meta;
    }

    initiateInstance() {}

    get name () { return this._name; }
    set name( name ) { this._name = name; }

    get persistencemode () { return this._persistencemode; }
    set persistencemode ( persistencemode ) { this._persistencemode = persistencemode }


    setDescription ( description ) { this.description = description; }

    //
    // events
    //

    addEventListener(eventname, listener) {
        let listeners = this._eventListeners[eventname];
        if (!listeners) {
            listeners = [];
            this._eventListeners[eventname] = listeners;
        }
        if (listeners.indexOf(listener) === -1) listeners.push(listener);
    }

    removeEventListener(eventname, listener) {
        let listeners = this._eventListeners[eventname];
        if (listeners) {
            let i = listeners.indexOf(listener);
            if (i > -1) listeners.splice(i, 1);
        }
    }

    emit(eventname, details) {
        let listeners = this._eventListeners[eventname];
        if (!listeners || listeners.length === 0) return;
        doAsync();
        (async (listeners) => {
            listeners.forEach(listener => {
                try {
                    listener(Object.assign({}, details));
                } catch (ignore) {
                    universe.logger.warn('Meta Event Listener cased an error', ignore);
                }
            })
        })(listeners);
    }

    emitEntityEvents(entity) {
        this._procesors.events.forEach((evtspec) => {
            try {
                const sensor = evtspec.sensorfn.bind(entity, entity);
                if (!sensor()) return;
                const detail = evtspec.detailfn
                               ? evtspec.detailfn.bind(entity, entity)()
                               : entity;
                // entity sends event
                entity.emit(evtspec.event, { detail });
                // meta also sends event
                this.emit(evtspec.event, { detail });
            } catch (ignore) {
                console.log("EntityEvent", ignore);
            }
        })
    }

    //
    // processors
    //

    /**
     * detectors will be invoked after each modification
     * of the entity.
     *
     * only for local modifications.
     * sync modifications will not invoke detectors.
     *
     * if a detector returns true, the entity emits the specified event
     *
     * listen to the entity with addEventListener()
     * @param {String} event         ... name of the event
     * @param {Function} sensorfn    ... 'this' bound to the entity. this function detects when the event must be emitted. will be invoked after every modification. only local, no sync modifications
     * @param {Function} [detailfn]   ... build the event details. otherwise the entity itself will be passed
     * @param [opt]                  ... options
     */
    event(event, sensorfn, detailfn, opt) {
        if (detailfn != undefined && !isFunction(detailfn) && isObject(detailfn)) {
            opt = detailfn;
            detailfn = undefined;
        }
        this._procesors.events.push(({ event, sensorfn, detailfn, opt }));
    }

    /**
     * modifiers will be invoked before the entity
     * will become materialized.
     * can adjust the entity before materialization.
     *
     * runs before filters.
     *
     * @param fn
     */
    // addModifier(fn) {
    //     this._procesors.modifiers.push(fn);
    // }

    /**
     * validators will be invoked before the entity
     * will become materialized, but after modifiers.
     *
     * works like a fiter if one validator returns false, the entity will not be materialized
     *
     * @param fn
     */
    // addValidator(fn) {
    //     this._procesors.validators.push(fn);
    // }

    //
    // Attributes
    //

    get $attributes() {
/*  requires major changes, because this will be invoked during attribute definition of the metaclass in initiateInstance()
        if (!this._$attributesBuilt) {
            if (this.useTimestamps) this._buildTimestampAttributes();
            this._$attributesBuilt = true;
        }
*/
        return this._attributes;
    }

    hasAttributes() { return !(this.$attributes?.is_empty) }
    getAttributes() { return this.$attributes }
    getAllAttributes() {}

    getAttributeNames() {
        return this.useTimestamps ? [] : Object.keys(this.$attributes);
    }

    addAttribute( attribute, name, options ) {
        this.$attributes[ attribute.name ] = attribute;
    }

    getAttribute(name) {
        return excludeAttribute(name)
               ? undefined
               : this.$attributes[name]
                 ?? (this.attributeMode !== ATTRIBUTE_MODE.NAMED
                    ? ARBITRARY_ATTRIBUTE
                    : undefined);
    }

    getDefaultValue(name) {
        const handle = this.$attributes[name]?.defaultValue;
        return isFunction(handle)
            ? handle()
            : handle;
    }

    async autoCompleteFor(entity, name) {
        const attr = this.$attributes[name];
        if (!attr) return await this.chainAutoComplete(entity);
        return await attr.buildAutoComplete();
    }

    async chainAutoComplete(entity) {
        // implement by subclass
        // default: no auto complete
    }

    // Timestamps

    suppressTimestamps() {
        this.useTimestamps = false;
    }

    _buildTimestampAttributes() {
        this.datetime("created", { description: 'automatic create date from the entity', enumerable: false, emergent: true });
        this.datetime("modified", { description: 'automatic create date from the entity', enumerable: false, emergent: true });
        this.datetime("deleted", { description: 'automatic create date from the entity', enumerable: false, emergent: true });
    }

    //
    // Helpers
    //

    /**
     * Helper Functions to create the MetaClass
     */

    text( name, options= {} )  {
        let attribute = new AttributeString();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }

    integer( name, options= {} )  {
        let attribute = new AttributeInteger();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }

    float( name, options= {} )  {
        let attribute = new AttributeFloat();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }

    boolean( name, options= {} )  {
        let attribute = new AttributeBoolean();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }
    datetime( name, options= {} )  {
        let attribute = new AttributeDateTime();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }

    image( name, options= {} )  {
        let attribute = new AttributeImage( { /* 'metaclass': ImageDescriptorMeta.getInstance() */ } );
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }
    object( name, cls, options= {} )  {
        let properties = {
            embedded    : false,
            cls,
            ...options
        };

        let attribute = new AttributeObject();
        this.addAttribute( this.fillAttribute( attribute,  name, properties) );

        return this.addAttribute( attribute );
    }

    collection( name, cls ,options= {} )  {
        let properties = {
            embedded    : false,
            autocomplete: true,
            cls,
            ...options
        };

        let attribute = new AttributeCollection();
        this.addAttribute( this.fillAttribute( attribute,  name, properties) );

        return this.addAttribute( attribute );
    }

    fillAttribute( attribute, name, options = {}) {
        let settings = { ...this.attributePresets, ...options };

        Object.assign(attribute, { name, ...settings });
        attribute.setObjectMetaClass( settings.cls ?? this );

        return attribute;
    }

    //
    // Actions
    //

    registerAction( actionspec, app_id, vm, ) {
        this.actions[ actionspec.name ] = actionspec;
    }

    getAllActions() {
        let result = {
            'all'      : [],
            'primary'  : [],
            'secondary': []
        }

        let actions = Object.values( this.actions );

        for (let i = 0; i < actions.length; i++) {
            let action  = actions[i];
            let sortkey = String(action.order ).padStart(3, '0') + action.label + action.name;
            switch (action.priority ) {
                case 1:
                    result.primary[ sortkey ] = action;
                    break;
                case 2:
                default:
                    result.secondary[ sortkey ] = action;
                    break;
            }
        }

        //--- sort each pocket  ---

        //--- load in sort sequence  ---
        result.primary   = Object.values(result.primary);
        result.secondary = Object.values(result.secondary);

        //--- combine in ALL pocket  ---
        result.all = [ ...result.primary, ...result.secondary ];

        return result;
    }
}

export class Attribute {

    // { name, metaclass, defaultValue, persistent, embedded, enumerable, emergent, mandatory, validations, i18n }
    constructor(options) {
        let settings = { ...ATTRIBUTE_PRESETS, ...options };
        this._name        = settings.name;
        this.metaclass    = settings.metaclass;
        this.defaultValue = settings.defaultValue;
        this.persistent   = settings.persistent;
        this.embedded     = settings.embedded;
        this.enumerable   = settings.enumerable;
        this.mandatory    = settings.mandatory;
        this.emergent     = settings.emergent;
        this.validations  = settings.validations;
        this.description  = settings.description;
        this.i18n         = settings.i18n;
    }
    get name () { return this._name; }
    set name( name ) { this._name = name; }

    setObjectMetaClass( metaclass ) { this.metaclass = metaclass; }

    i18nColumn() {
        return "XXX";
    }
    i18nField() {}
    i18nDescription() {}
    i18nHint() {}
    buildAutoComplete() {}
}

export class AttributeString     extends Attribute {}
export class AttributeInteger    extends Attribute {}
export class AttributeFloat      extends Attribute {}
export class AttributeBoolean    extends Attribute {}
export class AttributeDateTime   extends Attribute {}
export class AttributeObject     extends Attribute {}
export class AttributeCounter    extends Attribute {}
export class AttributeImage      extends Attribute {}
export class AttributeStream     extends Attribute {}
export class AttributeCollection extends Attribute {
    buildAutoComplete() {
        if (this.autocomplete && this.cls) return new this.cls();
    }
}


const ARBITRARY_ATTRIBUTE = new Attribute({
                                              mandatory   : false,
                                              persistent  : true,
                                              embedded    : false,
                                              enumerable  : true,
                                              emergent    : false,
                                              validations : [],
                                              i18n        : {},
                                          });
