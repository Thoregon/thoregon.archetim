/**
 * Walks through all cases of entity persistence
 *
 * - one owner
 * - simple entity
 * - complex entity with a referenced entity
 * - collections of entities (auto generated keys)
 * - dictionaries of entities (provided keys)
 * - dictionaries (index) on collections (derived keys from entity properties)
 *
 * - permissions: multiple owners
 * - invite other
 * - accept permit
 * - same cases as above, modifications from alternating SSIs
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ThoregonEntity from "../lib/thoregonentity.mjs";

//
// first we need an owner
// for all entities we handle
//


//
// Case: simple entity
// create a persistent simple entity
// use same permit to observe modifications
//

const simpleschema = {
    meta: {
        "version": "1.0.0",
        "description": "Simple entity schema for testing",
    },
    attributes: {
        name: { type: 'string' },
        description: { type: 'string' },
    }
};

// create the entity
const simple1 = await ThoregonEntity.create(simpleschema);
// make the entity persistent as 'simple1'
await simple1.persist("simple1");
//
const permitsimple1 = simple1.permit;

// now get the entity and observe modifications
const simple2 = await ThoregonEntity.get("simple1", permitsimple1);
// listen to modifications
const s2events = [];
simple2.addEventListener('*', (evt) => s2events.push(evt) );

simple1.name = "name1";
simple1.description = "description1";

//
// Case: entity with subentity
//

const complexschema = {
    meta: {
        "version": "1.0.0",
        "description": "Complex entity schema for testing",
    },
    attributes: {
        name: { type: 'string' },
        sub: { schema: simpleschema },
    }
};

const complex1 = await ThoregonEntity.create("complex1", complexschema);
const permitcomplex1 = simple1.permit;

// now get the entity and observe modifications

const complex2 = await ThoregonEntity.get("complex1", permitcomplex1);

// listen to modifications


//
// Case: collection of entities
//


//
// Case: dictionary as index on a collection
//

//
// Case: entity with contracts
// contracts must be fulfilled as a prerequisite for the entity to be persisted
//
