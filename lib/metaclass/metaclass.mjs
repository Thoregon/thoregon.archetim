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

import { isFunction, isObject, isSymbol, isRef } from "/evolux.util/lib/objutils.mjs";

    // import { ThoregonObject }                        from "../thoregonentity.mjs";               // !! import loop !!
    // import Collection                                from "../collection.mjs";                   // !! import loop !!

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

const excludeAttribute = (name) => isSymbol(name) || name.startsWith('$') || name.startsWith('_') || name.endsWith('$') || name.endsWith('_');

const ATTRIBUTE_PRESETS = {
    mandatory   : false,        // if true a value is required for the entity to be valid. Caution: also non valid entities will be stored, they can be revised later
    defaultValue: undefined,
    persistent  : true,         // defines if this property will be stored
    embedded    : true,         // be careful with objects and references and lists
    enumerable  : true,         // if false, this property will not show up in enumerations of the properties of the entity (iterators will skip it)
    autocomplete: false,        // defines if this property will be completed (initialized) automatically on access. takes either a default value or, if missing, creates a new instance from the specified class (object meta class)
    autoinit    : false,        // defines if this property will be initialized (resolve reference) when this (parent) is loaded
    merge       : true,         // if an object is assigned to the property and the current value is of the same class (hierarchy) or the assingned object is an Object, the objects will be merged
    derived     : false,        // derived from other properties e.g. age, can also be aggregated e.g. number of open items
    agent       : false,        // this attribute will only be synced between agents of the SSI, not in browser apps
//    itemclass   : undefined,    // class for items in collections and directories
    validations : [],
    i18n        : {},
    description : '',
    emergent    : false         // this is an emergent property provided by the universe
};

export const METACLASS_PROPERTY = Symbol('metaclass');

export const ANY_CLASS = Object;

let Collection;

export default class MetaClass {

    constructor() {
        this.classname        = undefined;
        this._name            = undefined;    // array with different information just as API - FormID etc
        this.description      = undefined;
        this.version          = 0;
        this._attributes      = {};           // object with styling information
        this._annotations     = {};
        this.embedded         = false;
        this.autoinit         = false;
        this.merge            = true;
        this.storeImmed       = false;
        this.attributeMode    = ATTRIBUTE_MODE.NAMED;
        this._persistencemode = PERSISTENCE_MODE.IMMEDIATE;     //  none | immediate | transaction
        this.attributePresets = ATTRIBUTE_PRESETS;
        this.actions          = {};
        this._eventListeners  = {};
        this.snapshots        = {};
        this.useTimestamps    = true;
        this._procesors = { events: [], modifiers: [], validators: [] };
        this.initiateInstance();
        this._buildTimestampAttributes();
    }

    static useCollectionCls(Cls) {
        Collection = Cls;
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

    static get PROP() {

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

    static build(fn) {
        const metaclass =  new this();
        fn(metaclass);
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

    emit(eventname, details, opt) {
        let listeners = this._eventListeners[eventname];
        if (!listeners || listeners.length === 0) return;
        if (opt?.once) delete  this._eventListeners[eventname];
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
        this._procesors.events.forEach(async (evtspec) => {
            try {
                const sensor = evtspec.sensorfn.bind(entity, entity);
                const res = await sensor();
                if (!res) return;
                const detail = evtspec.detailfn
                               ? evtspec.detailfn.bind(entity, entity)()
                               : entity;
                // entity sends event
                entity.emit(evtspec.event, { detail }, evtspec.opt);
                // meta also sends event
                this.emit(evtspec.event, { detail }, evtspec.opt);
            } catch (ignore) {
                console.log("EntityEvent", ignore);
            }
        })
    }

    //
    // annotations
    //

    useAnnotations(annotations) {
        this._annotations = annotations;
    }

    getClassAnnotations() {
        return this._annotations?.class;
    }

    getClassAnnotation(name) {
        const annotations = this.getClassAnnotations();
        return annotations?.[name];
    }

    getMethodAnnotations(methodname) {
        return this._annotations?.methods?.[methodname];
    }

    getAnnotationsForMethods(...annotationnames) {
        const mth = this._annotations.methods;
        const found = {};
        Object.entries(mth).forEach(([methodname, annotationdef]) => {
            const def = annotationnames.find((annotationname) => annotationdef[annotationname]);
            if (def) found[methodname] = annotationdef;
        });
        return found;
    }


    //
    // snapshots
    //

    /**
     *  shnapshots can be used to capture data.
     *  the main usage is in the order / transaction process
     */

    snapshot({data,name,Cls} = {}) {

        name = name ?? 'default';
      //  Cls  = Cls  ?? undefined;

        Cls = undefined;

        this.snapshots[name] = {
            data: data,
            Cls : Cls,
        };
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
     * @param [opt]                  ... options { once: true|false -> fire this event only once }
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

    //--- this function will remove the time stamp attributes created and modified
    //--- by default they will be available and stored in the DB
    suppressTimestamps( stamps = ['created', 'modified'] ) {
    }

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
        return Reflect.ownKeys(this.$attributes);
    }

    addAttribute(attribute) {
        attribute.setParentMetaClass(this);
        return this.$attributes[ attribute.name ] = attribute;
    }

    addCompoundAttribute(attribute) {
        return this.$attributes[ attribute.name ] = attribute;
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

    autoCompleteFor(entity, name) {
        const attr = this.$attributes[name];
        if (!attr) return this.chainAutoComplete(entity);
        return attr.buildAutoComplete(attr.metaclass);
    }

    chainAutoComplete(entity) {
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
        return this.addAttribute(MetaClass.text(name, options));
    }

    integer( name, options= {} )  {
        return this.addAttribute(MetaClass.integer(name, options));
    }

    float( name, options= {} )  {
        return this.addAttribute(MetaClass.float(name, options));
    }

    boolean( name, options= {} )  {
        return this.addAttribute(MetaClass.boolean(name, options));
    }
    datetime( name, options= {} )  {
        return this.addAttribute(MetaClass.datetime(name, options));
    }

    image( name, options= {} )  {
        return this.addAttribute(MetaClass.image(name, options));
    }

    object( name, cls, options= {} )  {
        return this.addAttribute(MetaClass.object(name, cls, options));
    }

    collection( name, cls ,options= {} )  {
        return this.addAttribute(MetaClass.collection(name, cls, options));
    }

    compound( name, initFN, options = {} )  {
        return this.addCompoundAttribute(MetaClass.compound(name, initFN, options));
    }

    fillAttribute( attribute, name, options = {}) {
        return this.constructor.fillAttribute(attribute, name, this.attributePresets, options);
    }

    static fillAttribute( attribute, name, presets, options = {}) {
        let settings = { ...presets ?? ATTRIBUTE_PRESETS, ...options };
        Object.assign(attribute, { name, ...settings });
        return attribute;
    }

    // embedded types


    static text( name, options= {} )  {
        let attribute = new AttributeString();
        return this.fillAttribute(attribute, name, options);
    }

    static integer( name, options= {} )  {
        let attribute = new AttributeInteger();
        return this.fillAttribute( attribute,  name, options);
    }

    static float( name, options= {} )  {
        let attribute = new AttributeFloat();
        return this.fillAttribute( attribute,  name, options);
    }

    static boolean( name, options= {} )  {
        let attribute = new AttributeBoolean();
        return this.fillAttribute( attribute,  name, options);
    }

    static datetime( name, options= {} )  {
        let attribute = new AttributeDateTime();
        return this.fillAttribute( attribute,  name, options);
    }

    //
    // referenced types
    //

    static image( name, options= {} )  {
        let properties = { embedded: false, autoinit: true, ...options };
        let attribute = new AttributeImage( { /* 'metaclass': ImageDescriptorMeta.getInstance() */ } );
        return this.fillAttribute( attribute,  name, properties);
    }

    static object( name, cls, options= {} )  {
        let properties = { embedded: false, cls, ...options };
        let attribute = new AttributeObject();
        return this.fillAttribute( attribute,  name, properties);
    }

    static collection( name, cls ,options= {} )  {
        let properties = { embedded: false, autocomplete: true, itemclass: undefined, compound: undefined, cls, ...options };
        let attribute = new AttributeCollection(properties.compound);
        return this.fillAttribute( attribute,  name, properties);
    }

    static compound( name, initFN, options = {} )  {
        let properties = { autocomplete: true, embedded: true, autoinit: true, ...options };
        let attribute = new AttributeCompound(initFN);
        return this.fillAttribute( attribute,  name, properties);
    }


    //
    // base attribute types
    //

    static typeText() {
        return new AttributeString();
    }

    static typeInteger() {
        return new AttributeInteger();
    }

    static typeFloat() {
        return new AttributeFloat();
    }

    static typeBoolean() {
        return new AttributeBoolean();
    }

    static typeDatetime() {
        return new AttributeDateTime();
    }

    static typeImage() {
        return new AttributeImage();
    }

    static typeObject(cls) {
        const attr = new AttributeObject();
        attr.cls = cls;
        return attr;
    }

    static typeCollection(cls) {
        const attr = new AttributeCollection();
        attr.cls = cls;
        return attr;
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

    // { name, metaclass, defaultValue, persistent, embedded, enumerable, emergent, derived, mandatory, validations, i18n }
    constructor(options) {
        let settings = { ...ATTRIBUTE_PRESETS, ...options };
        this._name           = settings.name;
        this.metaclass       = settings.metaclass;  // this is the metaclass this attribute belongs to
        this.targetMetaClass = settings.targetMetaClass; // this is the metaclass of the property value
        this.defaultValue    = settings.defaultValue;
        this.persistent      = settings.persistent;
        this.embedded        = settings.embedded;
        this.autoinit        = settings.autoinit;
        this.enumerable      = settings.enumerable;
        this.mandatory       = settings.mandatory;
        this.emergent        = settings.emergent;
        this.merge           = settings.merge;
        this.derived         = settings.derived;
        this.validations     = settings.validations;
        this.description     = settings.description;
        this.i18n            = settings.i18n;
        this.defined         = true;
    }
    get name () { return this._name; }
    set name( name ) { this._name = name; }
    get isSimple() { return false }
    get isText() { return false }
    get isDefined() { return this.defined }
    get hasDefaultValue() { return this.defaultValue != undefined }

    get doFullInit() {
        return false;
    }

    get storeIt() {
        return this.persistent && !this.emergent && !this.derived;
    }

    adjustEntity(object) {}

    adjustMetaclass(object) {}

    setObjectMetaClass(metaclass) {
        this.targetMetaClass = metaclass;
    }

    setParentMetaClass(metaclass) {
        this.parentMetaClass = metaclass;
    }

    i18nColumn() {
        return "XXX";
    }
    i18nField() {}
    i18nDescription() {}
    i18nHint() {}
    buildAutoComplete() {}
}

class AttributeSimple extends Attribute {
    get isSimple() { return true }
}
export class AttributeString     extends AttributeSimple {
    get isText() { return true }
}
export class AttributeInteger    extends AttributeSimple {}
export class AttributeFloat      extends AttributeSimple {}
export class AttributeBoolean    extends AttributeSimple {}
export class AttributeDateTime   extends AttributeSimple {}

class AttributeComplex extends Attribute {
    get isSimple() { return false }
    buildAutoComplete() {
        if (this.autocomplete && this.cls) {
            const Cls = this.cls;
            return Cls.$thoregonClass
                   ? Cls.create()
                   : new Cls();
        }
    }

    get doFullInit() {
        return this.embedded;
    }

    adjustEntity(value, currentValue) {
        if (!isRef(value) || value.constructor !== Object) return;                    // if it is not an object at all or if its class is not object don't adjust
        if (currentValue != undefined) return Object.assign(currentValue, value);     // if there was a content just assign it
        if (this.cls == undefined || this.cls === Object || !isFunction(this.cls)) return;                     // if there is a Class defined for this property create an Instance with the value's properties
        const Cls = this.cls;
        const entity = Cls.create?.(value);
        return entity;
    }

}

export class AttributeImage      extends AttributeComplex {}
export class AttributeObject     extends AttributeComplex {}

export class AttributeCollection extends AttributeComplex {

    constructor(initFN) {
        super();
        if (initFN) {
            const metaClass = new MetaClass();
            initFN(metaClass);
            this.setObjectMetaClass(metaClass);
        }
    }

    get doFullInit() {
        return this.embedded || this.autoinit;  // todo: check if 'autoinit' is correct
    }

    adjustEntity(items) {
        if (!isRef(items)) return;
        const Cls = this.cls ?? Collection;
        if (!Cls.$thoregonClass) return items;
        const col = Cls.with(items, this.itemclass);
        return col;
    }

    adjustMetaclass(object) {
        // object[METACLASS_PROPERTY] = this.targetMetaClass;
    }

}

export class AttributeCompound extends Attribute {

    constructor(initFN) {
        super();
        const metaClass = new MetaClass();
        initFN(metaClass);
        this.setObjectMetaClass(metaClass);
    }

    get doFullInit() {
        return true;
    }

    adjustMetaclass(object) {
        object[METACLASS_PROPERTY] = this.targetMetaClass;
    }

    get isSimple() { return false }

    buildAutoComplete() {
        if (!this.autocomplete) return
        const obj = this.cls ? new this.cls() : {};
        //obj[METACLASS_PROPERTY] = this.metaclass;
        return obj;
    }

}

// export class AttributeCounter    extends Attribute {}
// export class AttributeStream     extends Attribute {}

export const ARBITRARY_ATTRIBUTE = new Attribute({
                                              mandatory   : false,
                                              persistent  : true,
                                              embedded    : true,
                                              autoinit    : true,
                                              merge       : true,
                                              enumerable  : true,
                                              autocomplete: false,
                                              derived     : false,
                                              emergent    : false,
                                              validations : [],
                                              i18n        : {},
                                          });
//
// universals
//

if (globalThis.universe) {
    universe.$MetaClass          = MetaClass;
    universe.$METACLASS_PROPERTY = METACLASS_PROPERTY;
    universe.$ANY_CLASS          = ANY_CLASS;
    universe.$PERSISTENCE_MODE   = PERSISTENCE_MODE;
    universe.$ATTRIBUTE_MODE     = ATTRIBUTE_MODE;
    universe.$ATTRIBUTE_PRESETS  = ATTRIBUTE_PRESETS;
}
