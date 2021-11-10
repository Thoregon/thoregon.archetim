/**
 *
 *
 * @author: blukassen
 */

import EError from "/evolux.supervise/lib/error/eerror.mjs";

/*
class EError extends Error {
    constructor(msg, code) {
        super(msg);
        this.code = code;
    }
}
*/

export const ErrNotImplemented          = (msg)         => new EError(`Method not implemented: ${msg}`,         "ARCHETIM:00001");
export const ErrNoContentHandler        = ()            => new EError(`No content handler for graph`,           "ARCHETIM:00002");
export const ErrNoArraysSupported       = ()            => new EError(`No arrays supported in graph`,           "ARCHETIM:00003");
// export const ErrNoArraysSupported       = ()            => new EError(`No arrays supported in graph`,           "ARCHETIM:00003");

export const ErrObjectNotFound          = (msg)         => new EError(`Object not found: ${msg}`,               "ARCHETIM:00004");
export const ErrObjectOverwrite         = (msg)         => new EError(`Object overwrite: ${msg}`,               "ARCHETIM:00005");
