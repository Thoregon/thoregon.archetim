/**
 * a channel controller is a utility to handle entries
 * in channels.
 *
 * the purpose of this controller is to process entries of a channel
 * and maintain a separate history.
 *
 * controllers can not be used parallel on the same channel and history
 * because the client of this controller use it to process the entries.
 *
 * controllers are not feasible to implement message clients using the same history.
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

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
    static with(channel, history, handler) {
        const controller = new this();
        Object.assign(controller, { channel, history });
        controller.onEntity(handler);
        return controller;
    }

    //
    // info
    //

    hasUnprocessedEntries() {
        return this.channel.last !== this.history.latest;
    }

    numberUnprocessedEntries() {
        return this.channel.size - this.history.size;
    }

    numberUnprocessedEntriesOfType(type) {
        // todo [OPEN]: need to count
        return 0;
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
        this.channel.removeEventListener('change', this._channelchanged);
        this.handler = undefined;
        this.idle    = true;
    }

    //
    // processing
    //

    accelerate() {
        if (!this.handler) return;
        // if there was no entry processed, start with first from the channel
        const next = (this.history.latest) ? this.history.latest.next : this.channel.first;

        // if there is a next entry process it
        if (next) return (async () => await this.processEntry(next))();

        // listen to the channel and collect new entries
        if (!this.channel.hasEventListener('change', this._channelchanged)) this.channel.addEventListener('change', this._channelchanged);
    }

    channelChanged(evt) {
        if (this.idle) this.accelerate();
    }

    async processEntry(entry) {
        this.idle = false;
        try {
            const history          = this.history;

            // check if this entry was processed
            if (history.pending === entry || history.last === entry) return;

            history.pending        = entry;
            const { type, detail } = entry;
            try {
                await this.handler({ type, detail });
            } catch (e) {
                history.hadError(entry);
            }
            history.archive(entry);
        } finally {
            this.idle = true;
            delete history.pending;
        }
        this.accelerate();
    }
}
