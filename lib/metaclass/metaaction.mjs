
/*
 * Copyright (c) 2021.
 */

export const ACTION_PRIORITY = {
    "PRIMARY"  : 1,
    "SECONDARY": 2,
}

export default class MetaAction {
    constructor( metaclass, name, options = {}) {
        this.properties = {
            label      : name,
            description: '',
            tooltip    : '',
            priority   : ACTION_PRIORITY.SECONDARY,
            order      : 50,
            icon       : 'call_to_action',
            svg        : '',
            available  : true,
            disabled   : false,
            execute    : () => {},

            ...options };

        this.metaclass    = metaclass;
        this.name         = name;

        this.label       = this.properties.label;
        this.description = this.properties.description;
        this.tooltip     = this.properties.tooltip;
        this.priority    = this.properties.priority;
        this.order       = this.properties.order;

        this.icon        = this.properties.icon;
        this.svg         = this.properties.svg;
    }


    isAvailable( ) { return this.properties.available; }

    isDisabled() { return this.properties.disabled; }

    isActive() { return ! this.isDisabled(); }

    apply() { debugger; this.properties.execute(); }
}

