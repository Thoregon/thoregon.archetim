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
        return universe.observe(history);
    }

    static async load(servicename, channelname, methodname) {
        // don't do anything, new one will be created
    }

    store() {}

    async stop() {}

    processed(idx) {
        this.latest = idx;
    }

    hadError(idx, entry, error) {
        this.errors.push({ idx, error: error?.toString(), stack: error?.stack ?? '**no stacktrace' });
    }

    //
    // naming
    //


    static getDBEntryName(servicename, channelname, methodname) {
        const name = `${servicename}.${channelname}.${methodname}`;
        return name;
    }

    getDBEntryName() {
        const name = `${this.servicename}.${this.channelname}.${this.methodname}`;
        return name;
    }

}