/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { doAsync, timeout } from "/evolux.universe";

const RETRY_INTERVAL = 3000;
const WAIT_INIT      = 300;

// const DB             = () => universe.neulandlocal /*?? universe.neuland*/;

export default class ChannelConsumer {

    constructor(terminalid, name) {
        this.name       = name;
        this.terminalid = terminalid;
        this._active    = true;

        this._waiting   = [];
    }


    static forTerminal(terminalid, name) {
        const consumer = new this(terminalid, name);
        // consumer._loadWaiting();
        consumer._connectService();
        return consumer;
    }

    quit() {
        this._active = false;
    }

    async isReady() {
        try {
            if (!this.service) await timeout(WAIT_INIT);
            return this.service?.isReady() ?? false;
        } catch (e) {
            this._connectService();
            return false;
        }
    }

    _connectService() {
        (async () => {
            if (!this._active) return;  // don't connect anymore, channel was quit
            if (this.service) return this._processQ();   // already connected
            try {
                this.service = await agent.current.getChannel(this.name);
                this._processQ();
            } catch (e) {
                console.error(">> ChannelConsumer", e);
            }
        })();
    }

    sendEvent(type, detail = {}) {
        if (!type) return;  // log and throw
        if (!this.service) return this._enqueue(type, detail);    // enqueue when service is not ready
        this._sendEvent(type, detail);
    }

    async _sendEvent(type, detail) {
        try {
            await this.service.sendEvent(type, detail);
        } catch (e) {
            // todo [OPEN]: maintain local queue to resend it
            debugger;
        }
    }

    _enqueue(type, detail) {
        this._waiting.push({ type, detail });
        // this._storeWaiting();
        this._connectService();
    }

    _processQ() {
        const waiting = this._waiting;
        this._waiting = [];
        // this._storeWaiting();
        waiting.forEach(({ type, detail }) => this._sendEvent(type, detail));
    }

    _storeWaiting() {
/*
        const deviceid = device.current.id;
        const key     = `${deviceid}.channels.${this.name}`;
        const raw     = universe.util.txserialize(this._waiting);
        DB().set(key, raw);
*/
    }

    _loadWaiting() {
/*
        const deviceid = device.current.id;
        const key     = `${deviceid}.channels.${this.name}`;
        const raw     = DB().get(key);
        if (!raw) return;
        const ary     = universe.util.txdeserialize(raw, { skipThoregon: true }).obj
        this._waiting = ary;
*/
        this._waiting = [];
    }

    //
    // tesing & debugging
    //

    clearWaiting() {
        this._waiting = [];
        this._storeWaiting();
    }
}
