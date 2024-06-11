/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { timeout, doAsync } from '/evolux.universe';

const CALL_INTERVAL = {
    'S'     : 1000,
    'M'     : 60 * 1000,
    'H'     : 60 * 60 * 1000,
    'D'     : 24 * 60 * 60 * 1000,
    'second': 1000,
    'minute': 60 * 1000,
    'hour'  : 60 * 60 * 1000,
    'day'   : 24 * 60 * 60 * 1000,
}

let dttm;

const debugTS = () => {
    if (!dttm) dttm = universe.now;
    return (universe.now) - dttm;
}

const nextTick = async (fn) => {
    await doAsync();
    await fn()
};
//const nextTick = (what) => (async (fn) => { await doAsync(); await fn() })(what);

export default class ChannelController {

    constructor() {
        this.handler         = undefined;
        this.idle            = true;
        this._channelchanged = (evt) => this.channelChanged(evt);
    }


    //
    // API
    //

    /**
     * get a channel controller for a channel with a specified history
     *
     * @param {Channel}         channel
     * @param {ChannelHistory}  history
     * @param {Function}        handler ... a function with event: {  type: {String}, details: {Object} }
     */
    static with(channel, history, handler, opt = {}) {
        const controller = new this();
        Object.assign(controller, { channel, history, opt });
        controller.initOpt(opt);
        controller.onEntity(handler);
        nextTick( () => controller.restart());
        return controller;
    }

    initOpt(opt) {
        if (opt.callLimit) {
            const callLimit = opt.callLimit;
            const interval  = CALL_INTERVAL[opt.interval ?? 'minute'] ?? CALL_INTERVAL.minute;
            this.delay = { duration: Math.ceil(interval/callLimit) };
        }
    }

    //
    // entry handler
    //

    onEntity(handler) {
        if (!handler) return;
        this.handler = handler;
        this.accelerate();
    }

    close() {
        this.channel.removeEventListener('message', this._channelchanged);
    }

    //
    // message handling
    //

    restart() {
        // listen to the channel and collect new entries
        this.adjustHistory();
        if (!this.channel.hasEventListener('message', this._channelchanged)) this.channel.addEventListener('message', this._channelchanged);
        this.accelerate();
    }

    channelChanged(evt) {
        if (this.idle) (async () => {
            this.accelerate();
        })();
    }

    accelerate() {
        if (!this.handler) return;
        // if there was no entry processed, start with first from the channel
        let next = this.findLatest();
        // if (!next) next = this.channel.getFirst();

        // if there is a next entry process it
        if (next > -1) {
            this.processEntry(next);
            // const fn = ((idx) => {
            //     return async () => {
            //         await this.processEntry(idx);
            //     }
            // })(next);
            // nextTick(fn);
        }
    }

    async processEntry(idx) {
        this.idle     = false;
        const channel = this.channel;
        const history = this.history;
        try {
            history.processed(idx);     // to avoid loops immed process
            if (idx === this._pending) return;
            await this.handleCallLimit();
            this._pending = idx;
            const entry = channel.getEvent(idx);
            const { type, detail } = entry;
            try {
                await doAsync();
                // console.log(`>> process entry: Channel '${this.channel.name}'::Service '${this.history.servicename}' -> ${idx} type '${type}' `);
                await this.handler({ type, detail, restart: false });
            } catch (error) {
                // history.processed(idx);
                console.error(error, error.stack);
                let record = true;
                try {
                    if (this.errorhandler) record = !!this.errorhandler({ type, detail, error })
                } catch (ee) {
                    // this will just be logged
                    console.error("** ChannelController: Error in error handler:", ee, ee.stack);
                }
                try { if (record) history.hadError(idx, entry, error) } catch (eee) { console.log("** Severe: ", eee.stack) }
            }
        } finally {
            this.idle = true;
            delete this._pending;
        }
        this.accelerate();
    }

    async handleCallLimit() {
        await doAsync();
        if (!this.delay) return;

        const delay                 = this.delay;
        const duration              = delay.duration;
        const now                   = universe.inow;
        const earliestNextExecution = delay.earliestNextExecution ?? now;
        if (earliestNextExecution > now) await timeout(earliestNextExecution - now);
        delay.earliestNextExecution = universe.inow + duration;
    }

    findLatest() {
        const channel = this.channel;
        const last    = channel.last();
        const history = this.history;
        const latest  = history.latest;
        return (last === -1) ? -1 : (last > latest) ? latest + 1 : -1;
    }

    adjustHistory() {
        const channel = this.channel;
        const last    = channel.last();
        const history = this.history;
        const latest  = history.latest;
        if (latest > last) history.processed(last);
    }

}
