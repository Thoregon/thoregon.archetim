/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { localserialize, localdeserialize } from "/evolux.util/lib/serialize.mjs";

const getChannelsDir = () => (universe.NEULAND_STORAGE_OPT.location ?? 'data') + '/channels';
const WAIT_STORE = 250;

export default class ChannelHistory {

    constructor({ servicename, channelname } = {}) {
        Object.assign(this, { servicename, channelname });
        this.errors  = [];
        this.latest  = - 1;
        this.storing = false;
        this._save   = (history) => {
            history.save0()
        };
    }

    static forChannel({ servicename, channelname } = {}) {
        const history = new this({ servicename, channelname });
        return universe.observe(history);
    }

    static from({ servicename, channelname, errors, latest } = {}) {
        const history = this.forChannel({ servicename, channelname });
        history.errors = errors;
        history.latest = latest;
        return history;
    }

    processed(idx) {
        this.latest = idx;
        console.log("-- ChannelHistory.processed ", this.channelname + '::' + this.servicename, idx);
        this._save(this);
    }

    hadError(idx, entry, error) {
        this.errors.push({ idx, entry, error });
    }

    //
    // persistence
    //

    static async load(servicename, channelname) {
        try {
            const fs = universe.fs;    // get file system
            const dir = getChannelsDir();
            const filename = 'history_' + channelname + '_' + servicename + '.json';
            let stat;
            try {
                stat = await fs.stat(dir + '/' + filename);
            } catch (ignore) {}
            if (!stat) return;
            const json = await fs.readFile(dir + '/' + filename, { encoding: 'utf8' });
            const deser = localdeserialize(json);
            const channelHistory = ChannelHistory.from(deser.obj);
            console.log("-- ChannelHistory.load", channelHistory.servicename, channelHistory.channelname, channelHistory.latest);
            return channelHistory;
        } catch (e) {
            console.error("** CheckoutService", e);
        }
    }

    async store() {
        if (this.storing) return false;
        this.storing = true;
        try {
            const fs = universe.fs;    // get file system
            const dir = getChannelsDir();
            const filename = 'history_' + this.channelname + '_' + this.servicename + '.json';
            const json = localserialize(this);
            await fs.writeFile(dir + '/' + filename, json, 'utf8');
            console.log("-- ChannelHistory.store", this.servicename, this.channelname);
            return true;
        } catch (e) {
            console.error("** ChannelHistory", e);
        } finally {
            this.storing = false;
        }
        return false;
    }


    async save0() {
        if (!await this.store()) {
            console.log("-- ChannelHistory.store: enqueue while storing", this.name);
            if (this._storeTimout) clearTimeout(this._storeTimout);
            this._storeTimout = setTimeout(() => this.save0(), WAIT_STORE)
        }
    }

    
    //
    // testing and debugging
    //

    restart() {
        this.errors = [];
        this.latest = -1;
        this._save(this);
    }

}
