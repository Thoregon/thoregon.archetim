/**
 * Resolves persistent entities to 'Work' entities
 * may deliver streams or files
 * can also be used to deliver different objects
 * on different peers e.g. consumer/producer
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

const EntityResolver = (base) => class EntityResolver extends (base || Object) {

    get $entityResolver() {
        return false;
    }

    //
    // the creator may encrypt information other must not see.
    // only the creator can decrypt again
    // default does no encryption
    //

    static async getCrypto(opt) {
        // $@CRED
        // todo [OPEN]:
        //  - replace with real encryption and signing
        //  - private objects use the identities keys
        //  - shared objects use the keys from identities credentials
        const pubkey = 'SERVICE';
        const encrypt = async ({ p, s, c, ...opt } = {}) => { return { p: p ?? pubkey, c, ...opt } };
        const decrypt = async ({ p, s, c } = {}) => c;
        return { encrypt, decrypt };
    }

    async getCrypto(opt) {
        return await this.constructor.getCrypto(opt);
    }

    //
    //
    //

    async resolveEntity() {
        // implement by subclass
    }
}

//
// Polyfill
//

if (!Object.prototype.hasOwnProperty('$entityResolver')) Object.defineProperty(Object.prototype, '$entityResolver', { configurable: false, enumerable: false, writable: false, value: false });

//
// exports
//

export default EntityResolver;
