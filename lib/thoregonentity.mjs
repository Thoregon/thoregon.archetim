/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import ThoregonDecorator from "./thoregondecorator.mjs";
import MetaClass         from "./metaclass/metaclass.mjs";
import { asyncWithPath } from "/evolux.util";

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
    static async from(idOrRefStore) {
        const encrypt = async (obj) => obj;
        const decrypt = async (obj) => obj;
        encrypt.pub = '1234567890';
        decrypt.pub = '1234567890';

        // get the instance from
        const instance = await ThoregonDecorator.from(idOrRefStore, { encrypt, decrypt });
        return instance;
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
        return await ThoregonDecorator.materialized(idOrRef);
    }

    async create({ store, inmem = false } = {}) {
        const { encrypt, decrypt } = this.getCrypto();
        // decorate the object
        const entity = ThoregonDecorator.observe(this, { store, encrypt, decrypt, inmem });

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
        const { encrypt, decrypt } = this.getCrypto();
        // decorate the object
        const entity = ThoregonDecorator.observe(this, { store: idOrRef, encrypt, decrypt, inmem });
        await entity.__reserve__();
        // todo: if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.TRANSACTION) await entity.__add2transaction__();
        return entity;
    }

    getCrypto() {
        // todo [OPEN]:
        //  - replace with real encryption and signing
        //  - private objects use the identities keys
        //  - shared objects use the keys from identities credentials
        const encrypt = async (obj) => obj;
        const decrypt = async (obj) => obj;
        encrypt.pub = '1234567890';
        decrypt.pub = '1234567890';

        return { encrypt, decrypt };
    }

    //
    // utils
    //

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
        dorifer.checkinClass(url, this, this._metaclass);
        // console.log("checkIn", url);
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

export default ThoregonEntity;
