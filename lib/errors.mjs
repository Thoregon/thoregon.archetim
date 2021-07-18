/**
 *
 *
 * @author: blukassen
 */

// import EError from "/evolux.supervise/lib/error/eerror.mjs";

class EError extends Error {
    constructor(msg, code) {
        super(msg);
        this.code = code;
    }
}

export const ErrNotImplemented          = (msg)         => new EError(`Method not implemented: ${msg}`,         "LUCENT:00001");
export const ErrNoContentHandler        = ()            => new EError(`No content handler for graph`,           "LUCENT:00002");
export const ErrNoArraysSupported       = ()            => new EError(`No arrays supported in graph`,           "LUCENT:00003");
// export const ErrNoArraysSupported       = ()            => new EError(`No arrays supported in graph`,           "LUCENT:00003");
