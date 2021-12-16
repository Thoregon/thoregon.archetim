/**
 *
 * Tasks:
 * - $@CRED utilize credentials
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

// import ThoregonDecorator          from "./thoregondecorator.mjs";
import MetaClass                  from "./metaclass/metaclass.mjs";
import { asyncWithPath }          from "/evolux.util";
import { ErrCantReserveProperty } from "./errors.mjs";

const checkInQ = [];

const ThoregonEntity = (base) => class ThoregonEntity extends (base || Object) {

    //
    // Instantiation
    //

    static async create(props, { store, inmem = false } = {}) {
        // get class for schema and instantiate
        const instance = new this(props);
        // decorate the object
        const entity = await instance.create({ store, inmem });

        return entity;
    }

    // get the entity either with its id or from the reference to the store
    static async from(idOrRef) {
        const { encrypt, decrypt } = await this.getCrypto();

        // get the instance from
        const instance = await universe.ThoregonDecorator.from(idOrRef, { encrypt, decrypt });
        return instance;
    }

    static async materialized(idOrRef) {
        return await universe.ThoregonDecorator.materialized(idOrRef);
    }

    /**
     * reserve a template object for later use
     * if it is persistent, it will be
     * @param store
     * @return {Promise<void>}
     */
    static async reserve(idOrRef) {
        // get class for schema and instantiate
        const instance = new this();
        // decorate the object
        const entity = await instance.reserve(idOrRef);

        return entity;
    }

    static async materialized(idOrRef) {
        // check if the entity exists, either with its id or from the reference to the store
        return await universe.ThoregonDecorator.materialized(idOrRef);
    }

    async create({ store, inmem = false } = {}) {
        const { encrypt, decrypt } = await this.getCrypto();
        // decorate the object
        const entity = universe.ThoregonDecorator.observe(this, { store, encrypt, decrypt, inmem });

        // if the schema defines persistence 'immediate' store it
        if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.IMMEDIATE) {
            await entity.__materialize__();
        }
        // todo: if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.TRANSACTION) await entity.__add2transaction__();
        return entity;
    }

    // auto persist when valid
    // the entity sends a 'materialized' event when became persistent
    async reserve(idOrRef, { inmem = false } = {}) {
        const { encrypt, decrypt } = await this.getCrypto();
        // decorate the object
        const entity = universe.ThoregonDecorator.observe(this, { store: idOrRef, encrypt, decrypt, inmem });
        await entity.__reserve__(idOrRef);
        // todo: if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.TRANSACTION) await entity.__add2transaction__();
        return entity;
    }

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
        checkInQ.forEach(fn => fn());
    }

    get $thoregonEntity() {
        return this;
    }

    // mixin defaults

}

//
// Polyfill
//

if (!Object.prototype.$thoregonEntity) Object.defineProperty(Object.prototype, '$thoregonEntity', { configurable: false, enumerable: false, writable: false, value: undefined })

//
// exports
//

export default ThoregonEntity;

export class ThoregonObject extends ThoregonEntity() {}

if (globalThis.universe) universe.$ThoregonObject = ThoregonObject;
