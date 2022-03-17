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

export default class MetaClass {

    constructor() {
        this.classname          = undefined;
        this._name              = undefined;    // array with different information just as API - FormID etc
        this.description        = undefined;
        this.version            = 0;
        this.attributes         = {};           // object with styling information
        this.embedded           = false;
        this.attributeMode      = ATTRIBUTE_MODE.NAMED;
        this._persistencemode   = PERSISTENCE_MODE.IMMEDIATE;     //  none | immediate | transaction
        this.actions            = {};
        this.attributePresets   = {
            mandatory   : false,        // if true a value is required for the entity to be valid. Caution: also non valid entities will be stored, they can be revised later
            defaultValue: undefined,
            persistent  : true,         // defines if this property will be stored
            embedded    : true,         // be careful with objects and references and lists
            autocomplete: false,        // defines if this property will be completed (initialized) automatically on access. takes either a default value or, if missing, creates a new instance from the specified class (object meta class)
            validations : [],
            i18n        : {},
            description : ''
        };
        this.initiateInstance();
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

    initiateInstance() {}

    get name () { return this._name; }
    set name( name ) { this._name = name; }

    get persistencemode () { return this._persistencemode; }
    set persistencemode ( persistencemode ) { this._persistencemode = persistencemode }


    setDescription ( description ) { this.description = description; }

    //
    // Attributes
    //

    hasAttributes() { return !(this.attributes?.is_empty) }
    getAttributes() { return this.attributes }
    getAllAttributes() {}

    getAttributeNames() {
        return Object.keys(this.attributes);
    }

    addAttribute( attribute, name, options ) {
        this.attributes[ attribute.name ] = attribute;
    }

    getAttribute(name) {
        return excludeAttribute(name)
               ? undefined
               : this.attributes[name]
                 ?? (this.attributeMode !== ATTRIBUTE_MODE.NAMED
                    ? ARBITRARY_ATTRIBUTE
                    : undefined);
    }

    getDefaultValue(name) {
        return this.attributes[name]?.defaultValue;
    }

    async autoCompleteFor(name) {
        const attr = this.attributes[name];
        if (!attr) return;  // no auto complete
        return await attr.buildAutoComplete();
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
    constructor({ name, metaclass, defaultValue, persistent, embedded, validations, i18n } = {}) {
        this._name        = name;
        this.metaclass    = metaclass;
        this.defaultValue = defaultValue;
        this.persistent   = persistent;
        this.embedded     = embedded;
        this.validations  = validations;
        this.i18n         = i18n;
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
                                              persistent  : true,
                                              embedded    : false,
                                              validations : [],
                                              i18n        : {},
                                          });
