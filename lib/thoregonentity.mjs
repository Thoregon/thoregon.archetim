/**
 *
 * Tasks:
 * - $@CRED utilize credentials
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import MetaClass                  from "./metaclass/metaclass.mjs";
import { asyncWithPath }          from "/evolux.util";
import { ErrCantReserveProperty } from "./errors.mjs";
import ThoregonDecorator          from "./thoregondecorator.mjs";

const checkInQ = [];

const ThoregonEntity = (base) => class ThoregonEntity extends (base || Object) {

    //
    // Instantiation
    //

    /**
     * materialize - create a persistent object
     * the object is immediately persistent
     * gets a random store if store is omitted
     *
     * optionally, a store can be provided
     *
     * @param props
     * @param store     ... the store how the object can be found
     * @param inmem
     * @returns {Promise<*>}
     */
    static async materialize(props, { store, encrypt, decrypt } = {}) {
        const instance = new this();
        const entity = await instance.materialize(props,{ store, encrypt, decrypt });
        return entity;
    }

    /**
     * create - initiate an object which become persistent when
     * - it is assigned to a property of a ThoregonEntity (persistent object)
     * - if a store is provided
     * - it is stored by invoking .materialize() - gets a random store
     * @param props
     * @return {Promise<void>}
     */

    static async create(props, { store, encrypt, decrypt } = {}) {
        // get class for schema and instantiate
        const instance = new this();
        const entity = await instance.create(props, { store, encrypt, decrypt });
        return entity;
    }

    /**
     * reserve a template object for later use which is not persistent now
     * will become persistent when it is valid (allowCommit)
     *
     * the entity sends a 'materialized' event when became persistent
     */
    static async reserve(idOrRef, { encrypt, decrypt }={}) {
        // get class for schema and instantiate
        const instance = new this();
        // decorate the object
        const entity = await instance.reserve(idOrRef, { encrypt, decrypt });

        return entity;
    }

    // get the entity either with its id or from the reference to the store
    static async from(idOrRef, { dothrow } = {}) {
        const { encrypt, decrypt } = await this.getCrypto();

        // get the instance from
        const instance = await universe.ThoregonDecorator.from(idOrRef, { encrypt, decrypt, dothrow });
        return instance;
    }

    /**
     * restore a thoregon entity from a known store (soul).
     * if it does not exist, create it with the provided properties.
     *
     * @param store
     * @param props
     */
    static async restoreOrCreate(store, props) {
        let entity = await this.from(store);
        if (!entity) entity = await this.create(props, { store });
        return entity;
    }

    static async materialized(idOrRef) {
        // check if the entity exists, either with its id or from the reference to the store
        return await universe.ThoregonDecorator.materialized(idOrRef);
    }

    /**
     * materialize - create a persistent object
     * the object is immediately persistent,
     * even if no store is provided (will get a random one)
     *
     * @param store     ... the store how the object can be found
     * @param inmem
     * @returns {Promise<*>}
     */

    async materialize(props, { store, encrypt, decrypt } = {}) {
        const { encrypt: fallbackencrypt, decrypt: fallbackdecrypt } = await this.getCrypto();
        Object.assign(this, props);

        const entity = universe.ThoregonDecorator.observe(this, { store, encrypt: encrypt ?? fallbackencrypt, decrypt: decrypt ?? fallbackdecrypt });
        await entity.__materialize__();
        return entity;
    }

    /**
     * create - initiate an object which become persistent when it is assigned
     * to a property of a ThoregonEntity (persistent object) or a store is provided
     *
     * @param props
     * @return {Promise<void>}
     */
    async create(props, { store, encrypt, decrypt } = {}) {
        const { encrypt: fallbackencrypt, decrypt: fallbackdecrypt } = await this.getCrypto();
        Object.assign(this, props);

        const entity = universe.ThoregonDecorator.observe(this, { store, encrypt: encrypt ?? fallbackencrypt, decrypt: decrypt ?? fallbackdecrypt });
        if (store) await entity.__materialize__();
        return entity;
    }

    /**
     * reserve a template object for later use which is not persistent now
     *
     * the entity sends a 'materialized' event when became persistent
     * */
    async reserve(idOrRef, { encrypt, decrypt } = {}) {
        const { encrypt: fallbackencrypt, decrypt: fallbackdecrypt } = await this.getCrypto();
        // decorate the object
        const entity = universe.ThoregonDecorator.observe(this, { store: idOrRef, encrypt: encrypt ?? fallbackencrypt, decrypt: decrypt ?? fallbackdecrypt });
        await entity.__reserve__(idOrRef);
        // todo: if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.TRANSACTION) await entity.__add2transaction__();
        return entity;
    }

    /**
     * allowCommit
     * this function
     * @returns {<boolean>}
     */

    allowCommit() { return true; }


    /**
     * reserve a property for a class (which must be a ThoregonEntity)
     *
     * @param {String} prop
     * @param {ThoregonEntity} Cls
     * @return {Promise<void|*>}
     */
    async reserveProperty(prop, Cls) {
        if (this.reserved) throw ErrCantReserveProperty("can't reserve a property in a reserved object: " + prop);
        const reserved = await this.reservePropertyStore(prop, Cls);
        return reserved;
    }

    static async getCrypto(opt) {
        // $@CRED
        // todo [OPEN]:
        //  - replace with real encryption and signing
        //  - private objects use the identities keys
        //  - shared objects use the keys from identities credentials
        const pubkey = 'THOREGON';
        const encrypt = async ({ p, s, c, ...opt } = {}) => { return { p: p ?? pubkey, c, ...opt } };
        const decrypt = async ({ p, s, c } = {}) => c;
        return { encrypt, decrypt };
    }

    async getCrypto(opt) {
        return await this.constructor.getCrypto(opt);
    }

    //
    // utils
    //

    /**
     * get the property with the specified path
     *
     * @param path
     * @return {Promise<*>}
     */
    async getPath(path) {
        return await asyncWithPath(this, path);
    }

    //
    // Reflection
    //

    static get metaClass() {
        return this._metaclass;
    }

    get metaClass() {
        return this.constructor.metaClass;
    }

    // this may be replaced by the firewalls in the PULS (service worker)
    static checkIn({ url } = {}, metaClass) {
        // todo [OPEN]: add the class to the known classes. needed for persistence
        this._metaclass = metaClass.getInstance();
        if (globalThis.dorifer) {
            dorifer.checkinClass(url, this, this._metaclass);
        } else {
            checkInQ.push(() => dorifer.checkinClass(url, this, this._metaclass));
        }
        // console.log("checkIn", url);
    }

    static doCheckIn() {
        checkInQ.forEach(fn => {
            try {
                fn()
            } catch (e) {
                console.log("Dorifer checkinQ", e);
            }
        });
    }

    get $thoregonEntity() {
        return this;
    }

    // mixin defaults

    //
    // logging & debugging
    //

    static getlog$() {
        return ThoregonDecorator.getlog();
    }

    static clearlog$() {
        ThoregonDecorator.clearlog()
    }

}

//
// Polyfill
//

if (!Object.prototype.$thoregonEntity) Object.defineProperty(Object.prototype, '$thoregonEntity', { configurable: false, enumerable: false, writable: false, value: undefined });
if (!Function.prototype.metaClass) Object.defineProperty(Function.prototype, 'metaClass', { configurable: false, enumerable: false, writable: false, value: function ({ url } = {}, metaClass) { return this._metaclass } });
if (!Function.prototype.checkIn) Object.defineProperty(Function.prototype, 'checkIn', { configurable: false, enumerable: false, writable: false, value: function ({ url } = {}, metaClass) { globalThis.dorifer?.checkinClass(url, this, metaClass) } });

//
// exports
//

export default ThoregonEntity;

export class ThoregonObject extends ThoregonEntity() {}

if (globalThis.universe) universe.$ThoregonObject = ThoregonObject;
