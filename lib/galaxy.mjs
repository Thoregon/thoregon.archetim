/**
 * Wraps a peristent entity, collection or dictionary
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class Galaxy {

    constructor({
                    id
                } = {}) {
        Object.assign(this, { id });
    }

}
