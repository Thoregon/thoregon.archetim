/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export class Attribute {

    constructor(target, mthname, meta, params)  {
        Object.assign(this, params);
    }

}

dorifer.checkinAnnotation(import.meta, Attribute);

