/*
 * Copyright (c) 2021.
 */

/*
 *
 * @author: Martin Neitz
 */

const instances = new Map();

export default class MetaClass {

    constructor() {
        this.classname        = undefined;
        this._name            = undefined;    // array with different information just as API - FormID etc
        this.description      = undefined;
        this.version          = 0;
        this.attributes       = {};           // object with styling information
        this.embedded         = undefined;
        this._persistencemode = undefined;     //  none | immediate | transaction

        this.initiateInstance();
    }

    // Singelton instance of MetaClass may be cached in case of performance
    static getInstance() {
        let  instance = instances.get( this );
        if ( ! instance  ) {
            instance = new this();
            instances.set(this, instance );
        }
        return instance;
    }

    initiateInstance() {}

    get name () { return this._name; }
    set name( name ) { this._name = name; }

    get persistencemode () { return this._persistencemode; }
    set persistencemode ( persistencemode ) { this._persistencemode = persistencemode; }


    setDescription ( description ) { this.description = description; }

    getAttributes() { return this.attributes; }
    getAllAttributes() {}

    addAttribute( attribute, name, options ) {
        this.attributes[ attribute.name ] = attribute;
    }
    /**
     * Helper Functions to create the MetaClass
     */

    text    ( name, options= {} )  {
        let attribute = new AttributeString();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }
    integer   ( name, options= {} )  {
        let attribute = new AttributeInteger();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }
    float  ( name, options= {} )  {
        let attribute = new AttributeFloat();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }

    boolean   ( name, options= {} )  {
        let attribute = new AttributeBoolean();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }
    datetime  ( name, options= {} )  {
        let attribute = new AttributeDateTime();
        return this.addAttribute( this.fillAttribute( attribute,  name, options) );
    }

    object   ( name, className, options= {} )  {
        let properties = {
            embedded    : false,
            ...options
        };

        let attribute = new AttributeObject();
        this.addAttribute( this.fillAttribute( attribute,  name, properties) );
        attribute.setObjectMetaClass( className );

        return this.addAttribute( attribute );
    }

    collection   ( name, className ,options= {} )  {
        let properties = {
            embedded    : false,
            ...options
        };

        let attribute = new AttributeCollection();
        this.addAttribute( this.fillAttribute( attribute,  name, properties ) );
        attribute.setObjectMetaClass( className );

        return this.addAttribute( attribute );
    }

    fillAttribute( attribute, name, options = {}) {
        let properties = {
            defaultValue: '',
            persistent  : true,
            embedded    : true,  // be careful with objects and references and lists
            validations : [],
            i18n        : {},
            ...options
        }

        attribute.name = name;

        attribute.defaultValue = properties.defaultValue;
        attribute.persistent   = properties.persistent;
        attribute.embedded     = properties.embedded;
        attribute.validations  = properties.validations;
        attribute.i18n         = properties.i18n;

        attribute.setObjectMetaClass( this );
        return attribute;
    }
}

export class Attribute {
    constructor() {
        this._name        = undefined;
        this.metaclass    = undefined;
        this.defaultValue = undefined;
        this.persistent   = undefined;
        this.embedded     = undefined;
        this.validations  = undefined;
        this.i18n         = undefined;
    }
    get name () { return this._name; }
    set name( name ) { this._name = name; }

    setObjectMetaClass( metaclass ) { this.metaclass = metaclass; }
}

export class AttributeString     extends Attribute {}
export class AttributeInteger    extends Attribute {}
export class AttributeFloat      extends Attribute {}
export class AttributeBoolean    extends Attribute {}
export class AttributeDateTime   extends Attribute {}
export class AttributeObject     extends Attribute {}
export class AttributeCollection extends Attribute {}
export class AttributeImage      extends Attribute {}
export class AttributeStream     extends Attribute {}
