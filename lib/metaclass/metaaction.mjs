
/*
 * Copyright (c) 2021.
 */

export const ACTION_PRIORITY = {
    "PRIMARY"  : 1,
    "SECONDARY": 2,
}

export default class MetaAction {
    constructor( metaclass, name, options = {}) {
        let properties = {
            label      : name,
            description: '',
            tooltip    : '',
            priority   : ACTION_PRIORITY.SECONDARY,
            order      : 50,
            icon       : 'call_to_action',
            svg        : '',
            ...options };

        this.metaclass    = metaclass;
        this.name         = name;

        this.label       = properties.label;
        this.description = properties.description;
        this.tooltip     = properties.tooltip;
        this.priority    = properties.priority;
        this.order       = properties.order;

        this.icon        = properties.icon;
        this.svg         = properties.svg;
    }


    isAvailable( ) {
        return true;
    }

    isDisabled() {
        // is available and currently executable ....
        return false;
    }

    isActive() {
        return ! this.isDisabled();
    }
}

