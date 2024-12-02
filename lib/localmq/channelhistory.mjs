/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class ChannelHistory {

    constructor({ servicename, channelname, methodname } = {}) {
        Object.assign(this, { servicename, channelname, methodname });
        this.errors  = [];
        this.latest  = - 1;
    }

    static forChannel({ servicename, channelname, methodname } = {}) {
        const history = new this({ servicename, channelname, methodname });
        history.store();
        return universe.observe(history);
    }

    processed(idx) {
        this.latest = idx;
        console.log("-- ChannelHistory.processed ", this.channelname + '::' + this.servicename, idx);
        this.store();
    }

    hadError(idx, entry, error) {
        this.errors.push({ idx, error: error?.toString(), stack: error?.stack ?? '**no stacktrace' });
        this.store();
    }

    //
    // persistence
    //

    static getDBEntryName(servicename, channelname, methodname) {
        const name = `${servicename}.${channelname}.${methodname}`;
        return name;
    }

    getDBEntryName() {
        const name = `${this.servicename}.${this.channelname}.${this.methodname}`;
        return name;
    }

    static async load(servicename, channelname, methodname) {
        const db = universe.neuland;
        const json = db.get(this.getDBEntryName(servicename, channelname, methodname));
        if (!json) return;
        const entry = JSON.parse(json);
        const history = new this({ servicename, channelname, methodname });
        Object.assign(history, entry);
        return history;
    }

    store() {
        const db = universe.neuland;
        const entry = { latest: this.latest, errors: this.errors };
        db.set(this.getDBEntryName(), JSON.stringify(entry));
    }

    //
    // testing and debugging
    //

    restart() {
        this.errors = [];
        this.latest = -1;
        this.store();
    }

}
