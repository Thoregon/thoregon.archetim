/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class ChannelHistory {

    constructor({ servicename, channelname } = {}) {
        Object.assign(this, { servicename, channelname });
        this.errors = [];
        this.latest = -1;
        this._save = (history) => {};
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
        this._save(this);
    }

    hadError(idx, entry, error) {
        this.errors.push({ idx, entry, error });
    }

}
