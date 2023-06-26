/**
 *
 *
 * todo [OPEN]:
 *  - introduce state machine
 *  - nested transactions
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ThoregonDecorator from "../thoregondecorator.mjs";

//
// consts
//

export const TX_STATE = {
    ACTIVE            : 'ACTIVE',
    PARTIALLY_COMMITED: 'PARTIALLY_COMMITED',
    COMMITED          : 'COMMITED',
    FAILED            : 'FAILED',
    ABORTED           : 'ABORTED',
    // TERMINATED        : 'TERMINATED'
}

//
//
//

export default class Transaction {

    constructor(id, opt = {}) {
        this.id  = id ?? universe.random(5);
        this.opt = opt;
        this.state = undefined;
        this.involved = new Set();
    }

    static activate({ id, sync = false, parent } = {}) {
        parent = parent ?? ThoregonDecorator.currentTX;
        const tx = new this(id, { parent });
        tx.activate();
        ThoregonDecorator.withTX(tx);
        return tx;
    }

    //
    // Lifecycle
    //

    activate() {
        if (this.state != undefined) throw Error("TX wrong state", this.id, this.state, "activate()");
        this.state = TX_STATE.ACTIVE;
    }

    prepare() {
        if (!this.state == TX_STATE.ACTIVE) throw Error("TX wrong state", this.id, this.state, "prepare()");
        this.state = TX_STATE.PARTIALLY_COMMITED;
        try {
            this.__all__((entity) => entity.prepare$());
        } catch (e) {
            this.state = TX_STATE.FAILED;
        }
    }

    commit() {
        if (!this.state == TX_STATE.PARTIALLY_COMMITED) throw Error("TX wrong state", this.id, this.state, "commit()");
        try {
            this.__all__((entity) => entity.commit$());
            this.state = TX_STATE.COMMITED;
        } catch (e) {
            this.state = TX_STATE.FAILED;
            // -> this must not happen! only prepare can transit to FAILED
        }
        ThoregonDecorator.terminateTX(this);
    }

    rollback() {
        if (!this.state == TX_STATE.FAILED) throw Error("TX wrong state", this.id, this.state, "rollback()");
        try {
            this.__all__((entity) => entity.rollback$());
            this.state = TX_STATE.ABORTED;
        } catch (e) {
            this.state = TX_STATE.FAILED;
            // -> this must not happen! only prepare can transit to FAILED
        }
    }

    //
    // info
    //

    get isSyncTX() {
        return this.opt?.sync ?? false;
    }

    //
    // entities
    //

    involve(entity) {
        this.involved.add(entity);
    }

    isInvolved(entity) {
        return this.involved.has(entity);
    }

    //
    // helpers
    //

    __all__(fn) {
        [...this.involved.values()].forEach(fn);
    }
}
