/*
 * Copyright (c) 2022.
 */

/*
 * Copyright (c) 2022.
 */

/*
 *
 * @author: Martin Neitz
 */

const validationTrigger =  [
    "ON_VALUE_CHANGE",
    "ON_FOCUS_CHANGE",
    "ON_FORM_SUBMIT"
];

export default class Validator {

    constructor() {
        this.reported        = [];
        this.validationRules = [];
    }

    flush() {
        this.reported = {};
    }

    addRule( validationRule ) {
        this.validationRules.push(validationRule);
    }

    validate( level ) {
        let self = this;
        this.validationRules.forEach( function( validationmethod ) {
        });
    }

    hasErrors() {
        let keys = Reflect.ownKeys( this.errors ).length;
        return keys > 0;
    }

    getError() {
        let keys = Reflect.ownKeys(this.errors);
        keys.sort();
        return this.errors[keys[0]];
    }

}
