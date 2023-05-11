/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */


export class ThoregonEntity {

    constructor(target, mthname, meta, params)  {
        Object.assign(this, params);
    }

}

export const Attribute = (target, mthname, meta, params) => {
    const name = params.name;
    const attr = meta?.getAttribute(name);
    if (attr) {
        // allready defined
        return;
    }
};

export const Compound = (target, mthname, meta, params) => {
    const name = params.name;
    const attr = meta?.getAttribute(name);
    if (attr) {
        // allready defined
        return;
    }
};


export const Event = (target, mthname, meta, params) => {
    const name = params.name;
    const evt = meta.getEvent(name)
}

export const Inject  = (target, mthname, meta, params) => {
    const name = params.name;
}


universe.checkinAnnotation(import.meta, ThoregonEntity);
universe.checkinAnnotation(import.meta, Attribute);
universe.checkinAnnotation(import.meta, Event);
universe.checkinAnnotation(import.meta, Inject);

