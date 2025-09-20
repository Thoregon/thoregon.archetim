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
    }

    close() {
        this.channel.removeHistoryListener(this._channelchanged);
    }

    //
    // message handling
    //

    restart() {
        // listen to the channel and collect new entries
        if (!this.channel.hasHistoryListener(this._channelchanged)) this.channel.addHistoryListener(this._channelchanged);
    }

    channelChanged(evt) {
        this.processEntry(evt);
    }

    accelerate() {}

    async processEntry(evt) {
        this.idle     = false;
        const channel = this.channel;
        const history = this.history;
        try {
            const entry            = evt;
            const { type, detail, sent } = entry;
            try {
                await doAsync();
                await this.handler({ type, sent, detail, index: 0, restart: false });
            } catch (error) {
                console.error(error, error.stack);
                let record = true;
                try {
                    if (this.errorhandler) record = !!this.errorhandler({ type, detail, error })
                } catch (ee) {
                    // this will just be logged
                    console.error("** ChannelController: Error in error handler:", ee, ee.stack);
                }
                try {
                    if (record) history.hadError(0, entry, error)
                } catch (eee) {
                    console.log("** Severe: ", eee.stack)
                }
            }
        } catch (e) {
            console.log("** ChannelController: ", e);
        } finally {
            this.idle = true;
        }
    }

}
